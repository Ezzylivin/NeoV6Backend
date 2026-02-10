// File: backend/server.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios"; // 🟢 Added for Heartbeat
import app from "./app.js"; 
import { startPriceFeed } from "./services/priceService.js";

dotenv.config();

// 🟢 CONFIG: URLs for Keep-Alive
// If running locally, these might fail without a public URL, which is fine.
const SELF_URL = process.env.VITE_API_URL || "https://neov6backend.onrender.com";
const PYTHON_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";

// 🟢 HEARTBEAT FUNCTION
const keepAlive = async () => {
    try {
        // 1. Ping Node.js (Self)
        // Ensure you have a GET /api/health route in your app
        await axios.get(`${SELF_URL}/api/health`);
        console.log(`[Heartbeat] 💓 Node.js active.`);

        // 2. Ping Python (VPS)
        // This keeps the connection to the analysis engine warm
        await axios.get(`${PYTHON_URL}/backtest/status`);
        console.log(`[Heartbeat] 🐍 Python Engine active.`);
        
    } catch (error) {
        // It's normal to see errors locally if the URLs are for production
        console.error(`[Heartbeat] ⚠️ Ping failed: ${error.message}`);
    }
};

// --- Start MongoDB + Server ---
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected successfully.");

        startPriceFeed();
        console.log("📈 Background price feed started.");

        const PORT = process.env.PORT || 8000;
        app.listen(PORT, () => {
            console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
            
            // 🟢 START HEARTBEAT (Run every 5 minutes)
            // 300,000 ms = 5 minutes
            console.log("💓 Keep-Alive system engaged.");
            setInterval(keepAlive, 300000); 
            
            // Run once immediately on startup to check connections
            keepAlive();
        });

    } catch (err) {
        console.error("❌ Server startup failed:", err.message);
        process.exit(1);
    }
};

startServer();
