// File: backend/server.js
// 🚀 UPGRADE: v14.1 - Persistent Logs & Catch-Up Sync

import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios"; 
import http from "http"; 
import { Server } from "socket.io"; 
import app from "./app.js"; 
import { startPriceFeed } from "./services/priceService.js";

// 🟢 DB IMPORTS
import Bot from "./dbStructure/bot.js"; 
import Log from "./dbStructure/log.js"; // 🟢 Added for persistence
import { getBotStatus } from "./services/botService.js"; 

dotenv.config();

const SELF_URL = process.env.VITE_API_URL || "https://neov6backend.onrender.com";
const PYTHON_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";

// ============================================================
// 🟢 MONGOOSE CONNECTION LISTENERS
// ============================================================

mongoose.connection.on('connected', () => console.log("✅ MongoDB: Connection established."));
mongoose.connection.on('error', (err) => console.error(`❌ MongoDB: Connection error: ${err.message}`));
mongoose.connection.on('disconnected', () => console.warn("⚠️ MongoDB: Connection lost."));

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log("🛑 Mongoose connection closed.");
    process.exit(0);
});

// ============================================================
// 🟢 ROUTES: Health & History Sync
// ============================================================

app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// 🟢 NEW: History Catch-Up Endpoint
// Fetches the last 100 logs so the UI can "remember" the bot's thoughts
app.get("/api/bot/logs/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await Log.find({ userId })
            .sort({ timestamp: -1 })
            .limit(100);
        
        // Return messages in chronological order for the UI
        res.status(200).json(history.map(l => l.message).reverse());
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch log history" });
    }
});

app.get("/", (req, res) => res.status(200).send("🚀 NEO-V6 Backend is Healthy!"));

// ============================================================
// 🟢 3. WEBSOCKET SETUP
// ============================================================

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    if (userId) {
        console.log(`🔌 WebSocket: User connected ${userId}`);
        socket.join(userId);
    }
});

// 🟢 INTERNAL WEBHOOK: Python calls this
// Updated to SAVE to MongoDB before broadcasting
app.post('/api/internal/broadcast', async (req, res) => {
    const { userId, type, data } = req.body;
    
    if (!userId || !type || !data) {
        return res.status(400).json({ error: "Missing payload" });
    }

    try {
        // 1. 🟢 PERSIST LOG (If it's a thinking/log event)
        if (type === 'bot_log') {
            await Log.create({
                userId,
                message: data,
                level: data.includes('🧠') ? 'thought' : 'info',
                timestamp: new Date()
            });
        }

        // 2. 🟢 REAL-TIME BROADCAST
        io.to(userId).emit(type, data);
        
        res.status(200).json({ success: true });
    } catch (dbErr) {
        console.error("❌ Storage Error:", dbErr.message);
        // Still broadcast even if DB fails so user sees live data
        io.to(userId).emit(type, data);
        res.status(200).json({ success: true, warning: "Broadcasted but not saved" });
    }
});

// ============================================================
// 🟢 4. MAINTENANCE (Heartbeat & Auto-Save)
// ============================================================
const keepAlive = async () => {
    try {
        await axios.get(`${SELF_URL}/api/health`);
        try { await axios.get(`${PYTHON_URL}/docs`); } catch (e) {}
    } catch (e) {}
};

const autoSaveBots = async () => {
    try {
        const runningBots = await Bot.find({ status: 'running' }).select('userId');
        for (const bot of runningBots) {
            try { await getBotStatus(bot.userId); } catch (e) {}
        }
    } catch (e) {}
};

// ============================================================
// 🚀 SERVER STARTUP
// ============================================================
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        startPriceFeed();

        const PORT = process.env.PORT || 10000;
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            setInterval(keepAlive, 300000); 
            setInterval(autoSaveBots, 600000); 
        });
    } catch (err) {
        process.exit(1); 
    }
};

startServer();
