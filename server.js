const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const cors = require('cors');
const app = express();
const server = http.createServer(app);

app.use(cors());
const io = new Server(server, {
  maxHttpBufferSize: 50 * 1024 * 1024,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {

  socket.on('create-room', ({ roomId, userId, userName }) => {
    rooms[roomId] = { users: [{ id: userId, name: userName }], hostName: userName };
    socket.join(roomId);
    socket.userName = userName;
    socket.roomId = roomId;
    socket.emit('room-created', roomId);
  });

  socket.on('join-room', ({ roomId, userId, userName }) => {
    if (!rooms[roomId]) { socket.emit('join-error', 'Room not found'); return; }
    if (rooms[roomId].users.length >= 2) { socket.emit('join-error', 'Room is full'); return; }
    rooms[roomId].users.push({ id: userId, name: userName });
    socket.join(roomId);
    socket.userName = userName;
    socket.roomId = roomId;
    socket.emit('join-success', { roomId, hostName: rooms[roomId].hostName });
    socket.to(roomId).emit('peer-joined', { userName });
  });

  socket.on('send-message', ({ roomId, text, ts, senderName }) => {
    socket.to(roomId).emit('receive-message', { text, ts, senderName });
  });

  // Media handler — relay image/video as base64 to the other peer
  socket.on('send-media', ({ roomId, dataUrl, mediaType, fileName, senderName, ts }) => {
    socket.to(roomId).emit('receive-media', { dataUrl, mediaType, fileName, senderName, ts });
  });

  socket.on('typing', ({ roomId, userName }) => {
    socket.to(roomId).emit('peer-typing', { userName });
  });

  socket.on('stop-typing', (roomId) => {
    socket.to(roomId).emit('peer-stop-typing');
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit('peer-left');
    if (rooms[roomId]) {
      rooms[roomId].users = rooms[roomId].users.filter(u => u.name !== socket.userName);
      if (rooms[roomId].users.length === 0) delete rooms[roomId];
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('peer-left');
      if (rooms[socket.roomId]) {
        rooms[socket.roomId].users = rooms[socket.roomId].users.filter(u => u.name !== socket.userName);
        if (rooms[socket.roomId].users.length === 0) delete rooms[socket.roomId];
      }
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('SecureChat running on port ' + PORT);
});

