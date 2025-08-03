// File: backend/websocketManager.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const User = require('./models/userModel'); // This was missing

const clients = new Map();

// We need to pass the whole http server, not just the wss instance
function initializeWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', async (ws, req) => {
    const token = url.parse(req.url, true).query.token;
    if (!token) return ws.close(1008, 'Token required');

    try {
      // This logic is essential and was missing
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return ws.close(1008, 'Invalid user');
      
      const userId = user._id.toString();
      clients.set(userId, ws); // <-- CRITICAL FIX: Store by userId
      console.log(`[WS] Client connected: ${user.email}`);
      ws.send(JSON.stringify({ message: 'Live Log connection established.' }));

      ws.on('close', () => {
        clients.delete(userId); // <-- CRITICAL FIX: Delete by userId
        console.log(`[WS] Client disconnected: ${user.email}`);
      });

    } catch (error) {
      ws.close(1008, 'Invalid token');
    }
  });
}

function logToUser(userId, message) {
  const userSocket = clients.get(userId.toString());
  if (userSocket && userSocket.readyState === WebSocket.OPEN) {
    userSocket.send(JSON.stringify({ message }));
  }
}

module.exports = { initializeWebSocket, logToUser };
