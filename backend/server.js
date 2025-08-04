// File: backend/server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';

// Local imports
import connectDB from './config/db.js';
import apiRoutes from './routes/api.js';
import botRoutes from './routes/bot.js';
// import { initializeWebSocket } from './websocketManager.js';

dotenv.config();

// --- Main Setup ---
connectDB();
const app = express();
const PORT = process.env.PORT || 8000;

// --- Middleware ---

if (process.env.NODE_ENV === 'development') {
  console.log('Server is in DEVELOPMENT mode. Allowing all CORS requests.');
  app.use(cors());
} else {
  console.log('Server is in PRODUCTION mode. Using strict CORS policy.');
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000'
  ];

  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        callback(new Error(msg), false);
      }
    },
    credentials: true
  };
  app.use(cors(corsOptions));
}

app.use(express.json());

// --- Routes ---
app.use('/api', apiRoutes);
app.use('/api/bot', botRoutes);

// --- Root route ---
app.get('/', (req, res) => {
  res.send('API is running...');
});

// --- Server & WebSocket Setup ---

// Option 1: Using Express app.listen (no WebSocket support)
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'production'} mode.`);
// });

// Option 2: Using HTTP server for WebSocket support
const server = http.createServer(app);

// Uncomment next line to enable WebSocket support
// initializeWebSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'production'} mode.`);
});
