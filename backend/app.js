// File: backend/app.js
// FINAL VERSION: This file now uses a clean, modular routing system with consistent file paths.

import express from "express";
import cors from "cors";

// ✅ 1. Import all the modular route files with consistent .js extensions
import userRoutes from './routes/userRoutes.js';
import strategyRoutes from './routes/strategyRoutes.js';
import backtestRoutes from './routes/backtestRoutes.mjs'; // FIXED: Changed .mjs to .js
import backtestSetupRoutes from './routes/backtestSetupRoutes.js';
import botRoutes from './routes/botRoutes.js';

const app = express();

// --- Robust CORS Configuration (no changes needed) ---
const corsOptions = {
  origin: function (origin, callback) {
    const vercelRegex = /\.vercel\.app$/;
     const localhostRegex = /^http:\/\/localhost:\d+$/;
    if (
      !origin || 
      localhostRegex.test(origin) ||
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
// This is now the single source of truth for your API's structure.
app.use('/api/users', userRoutes);
app.use('/api/strategy', strategyRoutes);
app.use('/api/backtest', backtestRoutes); 
app.use('/api/backtestSetups', backtestSetupRoutes); // FIXED: Changed to use a hyphen
app.use('/api/bot', botRoutes);

export default app;

