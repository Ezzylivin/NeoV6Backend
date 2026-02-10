// File: backend/server.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios"; 
import app from "./app.js"; 
import { startPriceFeed } from "./services/priceService.js";

// 🟢 NEW IMPORTS: Needed for the Auto-Save Logic
import Bot from "./dbStructure/bot.js"; 
import { getBotStatus } from "./services/botService.js"; 

dotenv.config();

// 🟢 CONFIG: URLs for Keep-Alive
const SELF_URL = process.env.VITE_API_URL || "https://neov6backend.onrender.com";
const PYTHON_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";

// ------------------------------------------------------------
// 🟢 1. HEARTBEAT (Keeps Servers Awake)
// ------------------------------------------------------------
const keepAlive = async () => {
    try {
        // Ping Node.js (Self)
        await axios.get(`${SELF_URL}/api/health`);
        console.log(`[Heartbeat] 💓 Node.js active.`);

        // Ping Python (VPS)
        await axios.get(`${PYTHON_URL}/backtest/status`);
        console.log(`[Heartbeat] 🐍 Python Engine active.`);
    } catch (error) {
        // Suppress errors during local development if URLs are remote
        if (process.env.NODE_ENV === 'production') {
            console.error(`[Heartbeat] ⚠️ Ping failed: ${error.message}`);
        }
    }
};

// ------------------------------------------------------------
// 🟢 2. AUTO-SAVE (The "Scribe" - Saves Data Every 10 Mins)
// ------------------------------------------------------------
const autoSaveBots = async () => {
    try {
        // 1. Find all bots marked as "Running"
        const runningBots = await Bot.find({ status: 'running' }).select('userId');
        
        if (runningBots.length === 0) return;

        console.log(`[Auto-Save] 💾 Syncing data for ${runningBots.length} active bots...`);

        // 2. Force Sync each bot
        // calling getBotStatus() triggers the fetch-from-python -> save-to-mongo logic
        for (const bot of runningBots) {
            try {
                await getBotStatus(bot.userId);
                console.log(`[Auto-Save] ✅ Synced User: ${bot.userId}`);
            } catch (e) {
                console.error(`[Auto-Save] ⚠️ Failed for ${bot.userId}: ${e.message}`);
            }
        }
        
    } catch (error) {
        console.error(`[Auto-Save] Critical Error: ${error.message}`);
    }
};

// ------------------------------------------------------------
// 🚀 SERVER STARTUP
// ------------------------------------------------------------
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected successfully.");

        startPriceFeed();
        console.log("📈 Background price feed started.");

        const PORT = process.env.PORT || 8000;
        app.listen(PORT, () => {
            console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
            
            // --- SYSTEM SCHEDULERS ---

            // 1. Heartbeat (Every 5 Minutes) -> Prevents Sleep
            console.log("💓 Keep-Alive system engaged (5m interval).");
            setInterval(keepAlive, 300000); 
            keepAlive(); // Trigger immediately

            // 2. Auto-Save (Every 10 Minutes) -> Persists Data
            console.log("💾 Auto-Save system engaged (10m interval).");
            setInterval(autoSaveBots, 600000); 
            // We don't trigger immediately to let the server warm up first
        });

    } catch (err) {
        console.error("❌ Server startup failed:", err.message);
        process.exit(1);
    }
};

startServer();
