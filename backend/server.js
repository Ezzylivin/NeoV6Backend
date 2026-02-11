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

// ============================================================
// 🟢 NEW ROUTES: Fixes the 404 Heartbeat Error
// ============================================================

// 1. The Heartbeat Route (What keepAlive calls)
app.get("/api/health", (req, res) => {
    res.status(200).json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        service: "NEO-V6 Backend" 
    });
});

// 2. The Root Route (For browser verification)
app.get("/", (req, res) => {
    res.status(200).send("🚀 NEO-V6 Backend is Running & Healthy!");
});

// ============================================================
// 🟢 1. HEARTBEAT (Keeps Servers Awake)
// ============================================================
const keepAlive = async () => {
    try {
        // Ping Node.js (Self) - Now targeting the route we just created
        await axios.get(`${SELF_URL}/api/health`);
        console.log(`[Heartbeat] 💓 Node.js active.`);

        // Ping Python (VPS)
        // Note: Ensure your Python server has this route or change to "/"
        try {
            await axios.get(`${PYTHON_URL}/docs`); // Using /docs as it's standard FastAPI
            console.log(`[Heartbeat] 🐍 Python Engine active.`);
        } catch (pyErr) {
             console.log(`[Heartbeat] ⚠️ Python Ping failed (Check VPS): ${pyErr.message}`);
        }

    } catch (error) {
        if (process.env.NODE_ENV === 'production') {
            console.error(`[Heartbeat] ⚠️ Self-Ping failed: ${error.message}`);
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

        const PORT = process.env.PORT || 10000; // Default to 10000 for Render
        app.listen(PORT, () => {
            console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
            
            // --- SYSTEM SCHEDULERS ---

            // 1. Heartbeat (Every 5 Minutes) -> Prevents Sleep
            console.log("💓 Keep-Alive system engaged (5m interval).");
            setInterval(keepAlive, 300000); 
            // Wait 10s before first ping to allow server to fully boot
            setTimeout(keepAlive, 10000); 

            // 2. Auto-Save (Every 10 Minutes) -> Persists Data
            console.log("💾 Auto-Save system engaged (10m interval).");
            setInterval(autoSaveBots, 600000); 
        });

    } catch (err) {
        console.error("❌ Server startup failed:", err.message);
        process.exit(1);
    }
};

startServer();
