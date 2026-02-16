const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Store waiting users in memory
const waitingUsers = [];
// Store active sessions
const activeSessions = new Map();

app.prepare().then(() => {
  const server = express();
  const httpServer = createServer(server);
  
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  console.log("🚀 Socket.io server starting...");

  // Socket.io signaling server
  io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);

    // User joins waiting queue
    socket.on('join-queue', (userData) => {
      console.log('📝 Join queue request from:', socket.id, 'with data:', userData);
      
      // Prevent duplicate entries
      const existingIndex = waitingUsers.findIndex(w => w.id === socket.id);
      if (existingIndex > -1) {
        console.log('User already in queue, skipping');
        return;
      }
      
      const user = {
        id: socket.id,
        ...userData,
        joinedAt: Date.now()
      };

      waitingUsers.push(user);
      const position = waitingUsers.indexOf(user) + 1;
      socket.emit('waiting', { position });
      console.log(`User ${socket.id} added to queue. Position: ${position}, Total: ${waitingUsers.length}`);
      
      // Try to match immediately
      attemptMatch();

      // Also set a timeout to create bot session if no match in 5 seconds
      setTimeout(() => {
        // Check if user is still waiting
        if (waitingUsers.find(w => w.id === socket.id)) {
          console.log(`⏰ Timeout reached for ${socket.id}, creating bot session...`);
          createBotSession(socket.id);
        }
      }, 5000);
    });

    // WebRTC signaling - offer
    socket.on('webrtc-offer', (data) => {
      const { sessionId, offer, targetId } = data;
      io.to(targetId).emit('webrtc-offer', {
        sessionId,
        offer,
        from: socket.id
      });
    });

    // WebRTC signaling - answer
    socket.on('webrtc-answer', (data) => {
      const { sessionId, answer, targetId } = data;
      io.to(targetId).emit('webrtc-answer', {
        sessionId,
        answer,
        from: socket.id
      });
    });

    // WebRTC signaling - ICE candidate
    socket.on('ice-candidate', (data) => {
      const { sessionId, candidate, targetId } = data;
      io.to(targetId).emit('ice-candidate', {
        sessionId,
        candidate,
        from: socket.id
      });
    });

    // User leaves queue
    socket.on('leave-queue', () => {
      const index = waitingUsers.findIndex(w => w.id === socket.id);
      if (index > -1) {
        waitingUsers.splice(index, 1);
        console.log(`User ${socket.id} left queue`);
      }
    });

    // End session
    socket.on('end-session', (data) => {
      const { sessionId } = data;
      const session = activeSessions.get(sessionId);
      
      if (session) {
        const otherUser = session.users.find(u => u.id !== socket.id);
        if (otherUser) {
          io.to(otherUser.id).emit('session-ended', { reason: 'partner-left' });
        }
        activeSessions.delete(sessionId);
        console.log(`Session ${sessionId} ended`);
      }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
      // Remove from waiting queue
      const index = waitingUsers.findIndex(w => w.id === socket.id);
      if (index > -1) {
        waitingUsers.splice(index, 1);
        console.log(`User ${socket.id} removed from queue (disconnected)`);
      }

      // End any active sessions
      for (const [sessionId, session] of activeSessions) {
        if (session.users.find(u => u.id === socket.id)) {
          const otherUser = session.users.find(u => u.id !== socket.id);
          if (otherUser) {
            io.to(otherUser.id).emit('session-ended', { reason: 'partner-disconnected' });
          }
          activeSessions.delete(sessionId);
          console.log(`Session ${sessionId} ended due to disconnect`);
        }
      }
      
      console.log('❌ User disconnected:', socket.id);
    });
  });

  // Match two users from the queue
  function attemptMatch() {
    if (waitingUsers.length < 2) {
      return;
    }
    
    const user1 = waitingUsers[0];
    const user2 = waitingUsers[1];
    
    // Verify both sockets are connected
    const socket1 = io.sockets.sockets.get(user1.id);
    const socket2 = io.sockets.sockets.get(user2.id);
    
    if (!socket1 || !socket2) {
      // Clean up disconnected users
      if (!socket1) waitingUsers.shift();
      if (!socket2 && waitingUsers.length > 1) waitingUsers.splice(1, 1);
      return;
    }
    
    console.log(`🎯 Matching ${user1.id} with ${user2.id}`);
    
    // Remove both from waiting queue
    waitingUsers.splice(0, 2);
    
    // Create session
    const sessionId = `${user1.id}-${user2.id}`;
    const session = {
      id: sessionId,
      users: [user1, user2],
      startTime: Date.now(),
      duration: 30 * 60 * 1000
    };
    activeSessions.set(sessionId, session);
    
    // Notify both users
    io.to(user1.id).emit('match-found', {
      sessionId,
      partner: user2,
      isInitiator: true
    });
    io.to(user2.id).emit('match-found', {
      sessionId,
      partner: user1,
      isInitiator: false
    });
    
    console.log(`✅ Match created: ${sessionId}`);
    
    // Try to match more users
    if (waitingUsers.length >= 2) {
      attemptMatch();
    }
  }

  // Create bot session for single user
  function createBotSession(userId) {
    console.log(`🤖 createBotSession called for userId: ${userId}`);
    const realUser = waitingUsers.find(u => u.id === userId);
    if (!realUser) {
      console.log(`❌ User ${userId} not found in waitingUsers`);
      return;
    }
    
    const idx = waitingUsers.indexOf(realUser);
    if (idx > -1) waitingUsers.splice(idx, 1);
    
    const bot = {
      id: `bot-${Date.now()}`,
      isBot: true
    };
    
    const sessionId = `${realUser.id}-${bot.id}`;
    const session = {
      id: sessionId,
      users: [realUser, bot],
      startTime: Date.now(),
      duration: 30 * 60 * 1000
    };
    activeSessions.set(sessionId, session);
    
    console.log(`📤 Emitting match-found to ${realUser.id}...`);
    io.to(realUser.id).emit('match-found', {
      sessionId,
      partner: bot,
      isInitiator: true,
      isBotSession: true
    });
    
    console.log(`✅ Bot session created: ${sessionId}`);
  }

  // Periodically check for matches
  setInterval(() => {
    // Update queue positions
    waitingUsers.forEach((user, index) => {
      io.to(user.id).emit('waiting', { position: index + 1 });
    });
    
    // Try to match
    if (waitingUsers.length >= 2) {
      attemptMatch();
    }
    
    // Bot fallback - if single user for 5 seconds
    if (waitingUsers.length === 1) {
      const user = waitingUsers[0];
      const timeInQueue = Date.now() - user.joinedAt;
      console.log(`⏳ User ${user.id} in queue for ${timeInQueue}ms`);
      if (timeInQueue > 5000) {
        console.log(`🤖 Creating bot session for user ${user.id}...`);
        createBotSession(user.id);
      }
    }
  }, 1000);

  // Handle all other routes with Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`🌐 Ready on http://localhost:${PORT}`);
  });
});
