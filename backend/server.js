// File: backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');

// Local imports
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const { initializeWebSocket } = require('./websocketManager');
const botRoutes = require('./routes/bot');



// --- Main Setup ---
connectDB();
const app = express();
const server = http.createServer(app);

// --- Middleware ---

// Check the environment mode
if (process.env.NODE_ENV === 'development') {
  // In development, allow requests from ANY origin for easy testing.
  console.log('Server is in DEVELOPMENT mode. Allowing all CORS requests.');
  app.use(cors());
} else {
  // In production, use a strict, dynamic whitelist.
  console.log('Server is in PRODUCTION mode. Using strict CORS policy.');
  const allowedOrigins = [
    'http://localhost:5173', // Kept for consistency, though not strictly needed in prod
    'http://localhost:3000'
  ];

  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        callback(new Error(msg), false);
      }
    }
  };
  app.use(cors(corsOptions));
}

app.use(express.json());

// --- API Routes ---
app.use('/api', apiRoutes);
app.use('/api/bot', botRoutes);

// --- WebSocket Initialization ---
initializeWebSocket(server);

// --- Start Server ---
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'production'} mode.`));
