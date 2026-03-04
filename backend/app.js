// File: backend/app.js
import express from "express";
import cors from "cors";

// --- Route Imports ---
import userRoutes from "./routes/userRoutes.js";
import comboStrategyRoutes from "./routes/comboStrategyRoutes.js"; 
import backtestRoutes from "./routes/backtestRoutes.mjs"; // Ensure extension matches your file
import backtestSetupRoutes from "./routes/backtestSetupRoutes.js"; 
import botRoutes from "./routes/botRoutes.js"; 
import marketRoutes from "./routes/marketRoutes.js";
import mlRoutes from "./routes/mlRoutes.js";
import helpRoutes from "./routes/helpRoutes.js";

const app = express();

// --- CORS Configuration ---
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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- API Route Mounting ---
app.use("/api/users", userRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/combos", comboStrategyRoutes); 
app.use("/api/backtest", backtestRoutes);
app.use("/api/backtestSetups", backtestSetupRoutes); 
app.use("/api/bot", botRoutes); 
app.use("/api/market", marketRoutes); // 🟢 Fixes chart 404
app.use("/api/ml", mlRoutes);

// --- Health Check ---
app.get("/", (req, res) => {
  res.send("API is running...");
});

export default app;
