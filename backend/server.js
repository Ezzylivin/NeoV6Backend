// File: backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const User = require('./models/userModel');

// --- Main Setup ---
connectDB();
const app = express();
const server = http.createServer(app);

// --- Middleware ---
const allowedOrigins = [
  'http://localhost:5173', // Vite default for local testing
  'http://localhost:3000', // Create React App default for local testing
  'https://YOUR_VERCEL_FRONTEND_URL' // IMPORTANT: REPLACE THIS
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
};

app.use(cors(corsOptions));
app.use(express.json());

// --- API Routes ---
app.use('/api', apiRoutes);

// --- WebSocket Server for Live Logs ---
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', async (ws, req) => {
    const token = url.parse(req.url, true).query.token;
    if (!token) return ws.close(1008, 'Token required');
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return ws.close(1008, 'Invalid user');
        
        const userId = user._id.toString();
        clients.set(userId, ws);
        console.log(`[WS] Client connected: ${user.email}`);
        ws.send(JSON.stringify({ message: 'Live Log connection established.' }));

        ws.on('close', () => {
            clients.delete(userId);
            console.log(`[WS] Client disconnected: ${user.email}`);
        });
    } catch (error) {
        ws.close(1008, 'Invalid token');
    }
});

const logToUser = (userId, message) => {
    const userSocket = clients.get(userId.toString());
    if (userSocket && userSocket.readyState === WebSocket.OPEN) {
        userSocket.send(JSON.stringify({ message }));
    }
};
module.exports.logToUser = logToUser;

// --- Start Server ---
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
