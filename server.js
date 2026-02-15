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

        console.log(`Match found: ${user.id} with ${match.id}`);
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

  // Matching algorithm
  function findMatch(user) {
    // First, try to find perfect match (same topic, same duration, matching gender)
    let match = waitingUsers.find(w => {
      const topicMatch = w.topic.toLowerCase() === user.topic.toLowerCase() || 
                         isRelatedTopic(w.topic, user.topic);
      const durationMatch = w.duration === user.duration;
      const genderMatch = user.genderPreference === 'Any' || 
                          w.genderPreference === 'Any' ||
                          user.genderPreference === w.gender;
      return topicMatch && durationMatch && genderMatch;
    });

    // If no perfect match, find any available user
    if (!match) {
      match = waitingUsers.find(w => {
        const durationMatch = w.duration === user.duration;
        const genderMatch = user.genderPreference === 'Any' || 
                           w.genderPreference === 'Any' ||
                           user.genderPreference === w.gender;
        return durationMatch && genderMatch;
      });
    }

    // If still no match, return any waiting user
    if (!match && waitingUsers.length > 0) {
      match = waitingUsers[0];
    }

    return match;
  }

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
