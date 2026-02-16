// PartyKit Server for StudyBuddy Connect
// This handles WebSocket connections for real-time matching

import type * as Party from "partykit/server";

interface User {
  id: string;
  joinedAt: number;
}

interface Session {
  id: string;
  users: User[];
  startTime: number;
  duration: number;
}

export default class StudyBuddyServer implements Party.Server {
  constructor(readonly party: Party.Party) {}

  // In-memory storage (persists while server is running)
  waitingUsers: User[] = [];
  activeSessions: Map<string, Session> = new Map();

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`✅ User connected: ${conn.id}`);

    // Send current queue position if waiting
    const waitingIndex = this.waitingUsers.findIndex(w => w.id === conn.id);
    if (waitingIndex > -1) {
      conn.send(JSON.stringify({
        type: 'waiting',
        position: waitingIndex + 1
      }));
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message);
    console.log(`📨 Message from ${sender.id}:`, data.type);

    switch (data.type) {
      case 'join-queue':
        this.handleJoinQueue(sender);
        break;

      case 'leave-queue':
        this.handleLeaveQueue(sender.id);
        break;

      case 'webrtc-offer':
        this.handleWebRTCOffer(sender, data);
        break;

      case 'webrtc-answer':
        this.handleWebRTCAnswer(sender, data);
        break;

      case 'ice-candidate':
        this.handleICECandidate(sender, data);
        break;

      case 'end-session':
        this.handleEndSession(sender.id, data.sessionId);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    console.log(`❌ User disconnected: ${conn.id}`);

    // Remove from waiting queue
    const index = this.waitingUsers.findIndex(w => w.id === conn.id);
    if (index > -1) {
      this.waitingUsers.splice(index, 1);
      console.log(`User ${conn.id} removed from queue`);
    }

    // End any active sessions
    for (const [sessionId, session] of this.activeSessions) {
      if (session.users.find(u => u.id === conn.id)) {
        const otherUser = session.users.find(u => u.id !== conn.id);
        if (otherUser) {
          this.party.getConnection(otherUser.id)?.send(JSON.stringify({
            type: 'session-ended',
            reason: 'partner-disconnected'
          }));
        }
        this.activeSessions.delete(sessionId);
        console.log(`Session ${sessionId} ended due to disconnect`);
      }
    }
  }

  handleJoinQueue(sender: Party.Connection) {
    // Prevent duplicate entries
    const existingIndex = this.waitingUsers.findIndex(w => w.id === sender.id);
    if (existingIndex > -1) {
      console.log('User already in queue, skipping');
      return;
    }

    const user: User = {
      id: sender.id,
      joinedAt: Date.now()
    };

    this.waitingUsers.push(user);
    const position = this.waitingUsers.indexOf(user) + 1;
    
    sender.send(JSON.stringify({
      type: 'waiting',
      position
    }));
    
    console.log(`User ${sender.id} added to queue. Position: ${position}`);

    // Try to match immediately
    this.attemptMatch();

    // Bot fallback after 5 seconds if still waiting
    setTimeout(() => {
      if (this.waitingUsers.find(w => w.id === sender.id)) {
        console.log(`⏰ Timeout reached for ${sender.id}, creating bot session...`);
        this.createBotSession(sender.id);
      }
    }, 5000);
  }

  handleLeaveQueue(socketId: string) {
    const index = this.waitingUsers.findIndex(w => w.id === socketId);
    if (index > -1) {
      this.waitingUsers.splice(index, 1);
      console.log(`User ${socketId} left queue`);
    }
  }

  handleWebRTCOffer(sender: Party.Connection, data: any) {
    const { targetId, offer, sessionId } = data;
    const targetConn = this.party.getConnection(targetId);
    if (targetConn) {
      targetConn.send(JSON.stringify({
        type: 'webrtc-offer',
        offer,
        sessionId,
        from: sender.id
      }));
    }
  }

  handleWebRTCAnswer(sender: Party.Connection, data: any) {
    const { targetId, answer, sessionId } = data;
    const targetConn = this.party.getConnection(targetId);
    if (targetConn) {
      targetConn.send(JSON.stringify({
        type: 'webrtc-answer',
        answer,
        sessionId,
        from: sender.id
      }));
    }
  }

  handleICECandidate(sender: Party.Connection, data: any) {
    const { targetId, candidate, sessionId } = data;
    const targetConn = this.party.getConnection(targetId);
    if (targetConn) {
      targetConn.send(JSON.stringify({
        type: 'ice-candidate',
        candidate,
        sessionId,
        from: sender.id
      }));
    }
  }

  handleEndSession(socketId: string, sessionId: string) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      const otherUser = session.users.find(u => u.id !== socketId);
      if (otherUser) {
        this.party.getConnection(otherUser.id)?.send(JSON.stringify({
          type: 'session-ended',
          reason: 'partner-left'
        }));
      }
      this.activeSessions.delete(sessionId);
      console.log(`Session ${sessionId} ended`);
    }
  }

  attemptMatch() {
    if (this.waitingUsers.length < 2) {
      return;
    }

    const user1 = this.waitingUsers[0];
    const user2 = this.waitingUsers[1];

    // Verify both connections exist
    const conn1 = this.party.getConnection(user1.id);
    const conn2 = this.party.getConnection(user2.id);

    if (!conn1 || !conn2) {
      if (!conn1) this.waitingUsers.shift();
      if (!conn2 && this.waitingUsers.length > 1) this.waitingUsers.splice(1, 1);
      return;
    }

    console.log(`🎯 Matching ${user1.id} with ${user2.id}`);

    // Remove both from waiting queue
    this.waitingUsers.splice(0, 2);

    // Create session
    const sessionId = `${user1.id}-${user2.id}`;
    const session: Session = {
      id: sessionId,
      users: [user1, user2],
      startTime: Date.now(),
      duration: 30 * 60 * 1000
    };
    this.activeSessions.set(sessionId, session);

    // Notify both users
    conn1.send(JSON.stringify({
      type: 'match-found',
      sessionId,
      partner: user2,
      isInitiator: true
    }));
    conn2.send(JSON.stringify({
      type: 'match-found',
      sessionId,
      partner: user1,
      isInitiator: false
    }));

    console.log(`✅ Match created: ${sessionId}`);

    // Try to match more users
    if (this.waitingUsers.length >= 2) {
      this.attemptMatch();
    }
  }

  createBotSession(userId: string) {
    const realUser = this.waitingUsers.find(u => u.id === userId);
    if (!realUser) {
      console.log(`❌ User ${userId} not found in waitingUsers`);
      return;
    }

    const idx = this.waitingUsers.indexOf(realUser);
    if (idx > -1) this.waitingUsers.splice(idx, 1);

    const bot: User = {
      id: `bot-${Date.now()}`,
      joinedAt: Date.now()
    };

    const sessionId = `${realUser.id}-${bot.id}`;
    const session: Session = {
      id: sessionId,
      users: [realUser, bot],
      startTime: Date.now(),
      duration: 30 * 60 * 1000
    };
    this.activeSessions.set(sessionId, session);

    const conn = this.party.getConnection(realUser.id);
    if (conn) {
      conn.send(JSON.stringify({
        type: 'match-found',
        sessionId,
        partner: bot,
        isInitiator: true,
        isBotSession: true
      }));
    }

    console.log(`✅ Bot session created: ${sessionId}`);
  }
}

// Keep the server warm
setInterval(() => {
  console.log('🏓 PartyKit server alive');
}, 60000);
