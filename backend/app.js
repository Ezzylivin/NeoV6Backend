// File: backend/app.js
// UPGRADED: Corrected the base paths for the routes to be singular, matching the rest of the application.

import express from "express";
import cors from "cors";

// ✅ 1. Import all the modular route files
import userRoutes from './routes/userRoutes.js';
import strategyRoutes from './routes/strategyRoutes.js';
import backtestRoutes from './routes/backtestRoutes.mjs';
import backtestSetupRoutes from './routes/backtestSetupRoutes.js';
import botRoutes from './routes/botRoutes.js';


const app = express();

// --- Robust CORS Configuration (no changes needed) ---
const corsOptions = {
  origin: function (origin, callback) {
    const vercelRegex = /\.vercel\.app$/;
    if (
      !origin || 
      origin.startsWith("http://localhost") ||
      vercelRegex.test(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error("Request from this origin is not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// --- Middleware (no changes needed) ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- ✅ 2. Upgraded Modular API Routes ---
// The base paths are now singular to match the frontend API calls.
app.use('/api/users', userRoutes);
app.use('/api/strategy', strategyRoutes); // FIXED: Was '/api/strategies'
app.use('/api/backtest', backtestRoutes); // FIXED: Was '/api/backtests'
app.use('/api/backtestSetups', backtestSetupRoutes);
app.use('/api/bot', botRoutes);

export default app;

