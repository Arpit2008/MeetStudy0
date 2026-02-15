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
    }
  });

  // Socket.io signaling server
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User joins waiting queue
    socket.on('join-queue', (userData) => {
      console.log('Join queue request from:', socket.id, 'Data:', userData);
      
      const user = {
        id: socket.id,
        ...userData,
        joinedAt: Date.now()
      };

      // Check for matching user
      const match = findMatch(user);
      
      if (match) {
        // Remove match from waiting
        const matchIndex = waitingUsers.findIndex(w => w.id === match.id);
        if (matchIndex > -1) {
          waitingUsers.splice(matchIndex, 1);
        }

        // Create session
        const sessionId = `${user.id}-${match.id}`;
        const session = {
          id: sessionId,
          users: [user, match],
          startTime: Date.now(),
          duration: user.duration
        };
        activeSessions.set(sessionId, session);

        // Notify both users
        io.to(user.id).emit('match-found', {
          sessionId,
          partner: match,
          isInitiator: true
        });
        io.to(match.id).emit('match-found', {
          sessionId,
          partner: user,
          isInitiator: false
        });

        console.log(`Immediate match: ${user.id} with ${match.id}`);
      } else {
        // Add to waiting queue
        waitingUsers.push(user);
        socket.emit('waiting', { position: waitingUsers.length });
        console.log(`User ${socket.id} added to queue. Total waiting: ${waitingUsers.length}`);
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

  // Matching algorithm - SIMPLE: connect any two users quickly
  function findMatch(user) {
    // If there are users waiting, find ANY available match
    if (waitingUsers.length === 0) return null;
    
    // Find any user who is NOT ourselves
    const match = waitingUsers.find(w => w.id !== user.id);
    
    // Make sure we don't match user with themselves
    if (match && match.id === user.id) {
      return null;
    }

    console.log(`Matching ${user.id} with ${match?.id || 'none'}. Queue size: ${waitingUsers.length}`);
    return match;
  }

  // Periodically check for matches for all waiting users - FASTER matching
  setInterval(() => {
    if (waitingUsers.length < 2) return;
    
    console.log(`Periodic match check. Queue size: ${waitingUsers.length}`);
    
    // Try to find matches for all waiting users
    for (let i = 0; i < waitingUsers.length; i++) {
      const user = waitingUsers[i];
      const match = findMatch(user);
      
      if (match && match.id !== user.id) {
        // Remove both from waiting queue
        const matchIndex = waitingUsers.findIndex(w => w.id === match.id);
        
        // Get both users before removing
        const userIndex = i;
        const mIndex = matchIndex;
        
        // Remove in reverse order to maintain indices
        if (mIndex > userIndex) {
          waitingUsers.splice(mIndex, 1);
          waitingUsers.splice(userIndex, 1);
        } else {
          waitingUsers.splice(userIndex, 1);
          waitingUsers.splice(mIndex, 1);
        }

        // Create session
        const sessionId = `${user.id}-${match.id}`;
        const session = {
          id: sessionId,
          users: [user, match],
          startTime: Date.now(),
          duration: user.duration
        };
        activeSessions.set(sessionId, session);

        // Notify both users
        io.to(user.id).emit('match-found', {
          sessionId,
          partner: match,
          isInitiator: true
        });
        io.to(match.id).emit('match-found', {
          sessionId,
          partner: user,
          isInitiator: false
        });

        console.log(`Match found: ${user.id} with ${match.id}. Remaining: ${waitingUsers.length}`);
        break; // Exit loop after one match to avoid index issues
      }
    }
  }, 1000); // Check every 1 second (faster!)

  // Also update queue positions periodically
  setInterval(() => {
    waitingUsers.forEach((user, index) => {
      io.to(user.id).emit('waiting', { position: index + 1 });
    });
  }, 5000); // Update position every 5 seconds

  // Check if topics are related
  function isRelatedTopic(topic1, topic2) {
    const t1 = topic1.toLowerCase();
    const t2 = topic2.toLowerCase();
    
    const relatedGroups = [
      ['math', 'mathematics', 'algebra', 'calculus', 'geometry', 'statistics'],
      ['coding', 'programming', 'code', 'javascript', 'python', 'java', 'web dev'],
      ['biology', 'bio', 'chemistry', 'physics', 'science'],
      ['english', 'language', 'writing', 'literature'],
      ['history', 'social studies', 'geography']
    ];

    for (const group of relatedGroups) {
      if (group.includes(t1) && group.includes(t2)) {
        return true;
      }
    }
    
    return false;
  }

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
