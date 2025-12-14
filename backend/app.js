// File: backend/app.js
// UPGRADED VERSION: Modular routing, consolidated Bot+Strategy endpoints.

import express from "express";
import cors from "cors";

// --- Route Imports ---
import userRoutes from "./routes/userRoutes.js";
import strategyRoutes from "./routes/strategyRoutes.js";
import comboStrategyRoutes from "./routes/comboStrategyRoutes.js"; 
import backtestRoutes from "./routes/backtestRoutes.mjs"; // ⚠️ NOTE: Ensure you renamed .mjs to .js
import backtestSetupRoutes from "./routes/backtestSetupRoutes.js"; // Kept for legacy/direct access
import botRoutes from "./routes/botRoutes.js"; // 🚀 CONTAINS: /status, /start, /stop, /winners, /strategies
import mlRoutes from "./routes/mlRoutes.js";

const app = express();

// --- Robust CORS Configuration ---
const corsOptions = {
  origin: function (origin, callback) {
    const vercelRegex = /\.vercel\.app$/;
    const localhostRegex = /^http:\/\/localhost:\d+$/;
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (localhostRegex.test(origin) || vercelRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Request from this origin is not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// --- Middleware ---
// Increased limits to handle large JSON payloads from backtest results
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- API Route Mounting ---
app.use("/api/users", userRoutes);
app.use("/api/strategy", strategyRoutes);
app.use("/api/combos", comboStrategyRoutes); 
app.use("/api/backtest", backtestRoutes);

// Optional: You can keep this for direct access, but 'botRoutes' now handles strategies too
app.use("/api/backtestSetups", backtestSetupRoutes); 

// 🚀 CRITICAL: This mounts your new Unified Router
// Calls to /api/bot/strategies will now work
app.use("/api/bot", botRoutes); 

app.use("/api/ml", mlRoutes);

// --- Health Check (Optional but good for Render/Heroku) ---
app.get("/", (req, res) => {
  res.send("API is running...");
});

export default app;
