// File: backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');

// Local imports
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const { initializeWebSocket } = require('./websocketManager'); // <-- We now import from our new file

// --- Main Setup ---
connectDB();
const app = express();
const server = http.createServer(app);

// --- Middleware ---
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://neo-v6-frontend.vercel.app' // <-- This contains the critical CORS fix
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
  }
};

app.use(cors(corsOptions));
app.use(express.json());

// --- API Routes ---
app.use('/api', apiRoutes);

// --- WebSocket Initialization ---
initializeWebSocket(server); // <-- We pass the whole server to the manager

// --- Start Server ---
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
