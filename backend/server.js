// File: backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');

// Local imports
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const { initializeWebSocket } = require('./websocketManager');

// --- Main Setup ---
connectDB();
const app = express();
const server = http.createServer(app);

// --- Middleware ---

// This is the dynamic whitelist. It allows your local machine and any Vercel domain.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000'
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like Postman, mobile apps, etc.)
    if (!origin) return callback(null, true);

    // Allow our standard local development origins
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);

    // Allow any subdomain from vercel.app
    if (origin.endsWith('.vercel.app')) return callback(null, true);

    // If it's none of the above, block it
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  }
};

// Use the CORS options we just defined
app.use(cors(corsOptions));
app.use(express.json());


// --- API Routes ---
app.use('/api', apiRoutes);

// --- WebSocket Initialization ---
initializeWebSocket(server);

// --- Start Server ---
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
