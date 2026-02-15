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

  // Socket.io signaling server
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User joins waiting queue
    socket.on('join-queue', (userData) => {
      console.log('Join queue request from:', socket.id, 'Data:', userData);
      
      // Prevent duplicate entries - check if already in queue
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

      // Add to waiting queue FIRST
      waitingUsers.push(user);
      const position = waitingUsers.length;
      socket.emit('waiting', { position });
      console.log(`User ${socket.id} added to queue. Total waiting: ${waitingUsers.length}`);
      
      // Try to match immediately after adding
      if (waitingUsers.length >= 2) {
        attemptMatch();
      }
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
      // Remove from waiting queue if present
      const index = waitingUsers.findIndex(w => w.id === socket.id);
      if (index > -1) {
        waitingUsers.splice(index, 1);
        console.log(`User ${socket.id} disconnected from queue`);
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
      
      console.log('User disconnected:', socket.id);
    });
  });

  // Try to match two users from the queue immediately
  function attemptMatch() {
    console.log(`[attemptMatch] Called. Current queue length: ${waitingUsers.length}`);
    
    // Need at least 2 users to match
    if (waitingUsers.length < 2) {
      console.log(`[attemptMatch] Not enough users (${waitingUsers.length}), skipping`);
      return;
    }
    
    // Get first two users
    const user1 = waitingUsers[0];
    const user2 = waitingUsers[1];
    
    if (!user1 || !user2) {
      console.log(`[attemptMatch] User undefined: user1=${!!user1}, user2=${!!user2}`);
      return;
    }
    
    console.log(`[attemptMatch] Matching user1=${user1.id} with user2=${user2.id}`);
    
    // Remove both from waiting queue
    waitingUsers.splice(0, 2);
    
    // Create session
    const sessionId = `${user1.id}-${user2.id}`;
    const session = {
      id: sessionId,
      users: [user1, user2],
      startTime: Date.now(),
      duration: 30 * 60 * 1000 // 30 minutes in ms
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
    
    console.log(`✅ Match found: ${user1.id} with ${user2.id}. Remaining: ${waitingUsers.length}`);
    
    // If more users waiting, try to match again immediately
    if (waitingUsers.length >= 2) {
      console.log(`[attemptMatch] More users waiting, recursively matching...`);
      attemptMatch();
    }
  }

  // Periodically check for matches for all waiting users
  setInterval(() => {
    // First update queue positions
    waitingUsers.forEach((user, index) => {
      io.to(user.id).emit('waiting', { position: index + 1 });
    });
    
    // Try to match - call attemptMatch for each pair
    if (waitingUsers.length >= 2) {
      console.log(`[Interval] Queue has ${waitingUsers.length} users, attempting match`);
      attemptMatch();
    }
    
    // DEBUG: Auto-create bot if someone is alone for testing
    if (waitingUsers.length === 1) {
      const realUser = waitingUsers[0];
      // Only create bot if real user has been waiting for 5+ seconds
      if (Date.now() - realUser.joinedAt > 5000) {
        console.log(`[DEBUG] Creating bot session for testing - real user waiting ${Date.now() - realUser.joinedAt}ms`);
        
        // Remove real user from queue
        waitingUsers.shift();
        
        // Create bot user object
        const bot = {
          id: `bot-${Date.now()}`,
          isBot: true
        };
        
        // Create session directly
        const sessionId = `${realUser.id}-${bot.id}`;
        const session = {
          id: sessionId,
          users: [realUser, bot],
          startTime: Date.now(),
          duration: 30 * 60 * 1000
        };
        activeSessions.set(sessionId, session);
        
        // Notify the real user - they're matched with a bot!
        io.to(realUser.id).emit('match-found', {
          sessionId,
          partner: bot,
          isInitiator: true,
          isBotSession: true
        });
        
        console.log(`[DEBUG] Bot session created for ${realUser.id}`);
      }
    }
  }, 1000); // Check every 1 second

  // Handle all other routes with Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
