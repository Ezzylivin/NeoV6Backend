// File: backend/app.js
// UPGRADED VERSION: Modular routing with combo strategies and consistent .js extensions

import express from "express";
import cors from "cors";

// ✅ Import all route modules
import userRoutes from "./routes/userRoutes.js";
import strategyRoutes from "./routes/strategyRoutes.js";
import comboStrategyRoutes from "./routes/comboStrategyRoutes.js"; // NEW: Combo strategies
import backtestRoutes from "./routes/backtestRoutes.mjs";
import backtestSetupRoutes from "./routes/backtestSetupRoutes.js";
import botRoutes from "./routes/botRoutes.js";

const app = express();

// --- Robust CORS Configuration ---
const corsOptions = {
  origin: function (origin, callback) {
    const vercelRegex = /\.vercel\.app$/;
    const localhostRegex = /^http:\/\/localhost:\d+$/;
    if (!origin || localhostRegex.test(origin) || vercelRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Request from this origin is not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- API Routes ---
app.use("/api/users", userRoutes);
app.use("/api/strategy", strategyRoutes);
app.use("/api/combo-strategy", comboStrategyRoutes); // NEW: Combo strategies endpoint
app.use("/api/backtest", backtestRoutes);
app.use("/api/backtestSetups", backtestSetupRoutes);
app.use("/api/bot", botRoutes);

export default app;
