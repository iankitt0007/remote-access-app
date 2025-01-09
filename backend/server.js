const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const sessions = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-session", () => {
    const sessionId = uuidv4();
    sessions[sessionId] = {
      host: socket.id,
      participants: new Set([socket.id]),
      activeStreams: new Map()
    };
    socket.join(sessionId);
    socket.emit("session-created", { sessionId, role: 'host' });
  });

  socket.on("join-session", (sessionId) => {
    if (sessions[sessionId]) {
      socket.join(sessionId);
      sessions[sessionId].participants.add(socket.id);
      
      // Notify everyone in the session about the new participant
      io.to(sessionId).emit("participant-joined", {
        participantId: socket.id,
        totalParticipants: Array.from(sessions[sessionId].participants)
      });

      // If someone is already sharing, notify the new participant
      sessions[sessionId].activeStreams.forEach((streamInfo, streamerId) => {
        socket.emit("user-started-sharing", {
          userId: streamerId,
          sessionId
        });
      });
    } else {
      socket.emit("error", "Session not found");
    }
  });

  socket.on("get-participants", (sessionId, callback) => {
    if (sessions[sessionId]) {
      callback(Array.from(sessions[sessionId].participants));
    } else {
      callback([]);
    }
  });

  socket.on("start-sharing", (sessionId) => {
    if (sessions[sessionId]) {
      sessions[sessionId].activeStreams.set(socket.id, {
        startTime: Date.now()
      });
      socket.to(sessionId).emit("user-started-sharing", {
        userId: socket.id,
        sessionId
      });
    }
  });

  socket.on("stop-sharing", (sessionId) => {
    if (sessions[sessionId]) {
      sessions[sessionId].activeStreams.delete(socket.id);
      socket.to(sessionId).emit("user-stopped-sharing", {
        userId: socket.id,
        sessionId
      });
    }
  });

  socket.on("signal", ({ to, signal }) => {
    io.to(to).emit("signal", {
      from: socket.id,
      signal
    });
  });

  socket.on("disconnect", () => {
    // Clean up all sessions this user was part of
    Object.entries(sessions).forEach(([sessionId, session]) => {
      if (session.participants.has(socket.id)) {
        session.participants.delete(socket.id);
        session.activeStreams.delete(socket.id);
        
        io.to(sessionId).emit("participant-left", {
          participantId: socket.id,
          totalParticipants: Array.from(session.participants)
        });

        if (session.activeStreams.has(socket.id)) {
          io.to(sessionId).emit("user-stopped-sharing", {
            userId: socket.id,
            sessionId
          });
        }
        
        // If this was the host and no participants remain, clean up the session
        if (session.host === socket.id && session.participants.size === 0) {
          delete sessions[sessionId];
        }
      }
    });
  });
});

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});