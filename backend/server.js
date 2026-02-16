// File: backend/server.js
// 🚀 UPGRADE: v14.2 - Corrected Broadcast Logic & Persistent Sync

import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios"; 
import http from "http"; 
import { Server } from "socket.io"; 
import app from "./app.js"; 
import { startPriceFeed } from "./services/priceService.js";

// 🟢 DB IMPORTS
import Bot from "./dbStructure/bot.js"; 
import Log from "./dbStructure/log.js"; 
import { getBotStatus } from "./services/botService.js"; 

dotenv.config();

app.use(express.json());


const SELF_URL = process.env.VITE_API_URL || "https://neov6backend.onrender.com";
const PYTHON_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";

// ============================================================
// 🟢 MONGOOSE CONNECTION LISTENERS
// ============================================================
mongoose.connection.on('connected', () => console.log("✅ MongoDB: Connected."));
mongoose.connection.on('error', (err) => console.error(`❌ MongoDB Error: ${err.message}`));

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log("🛑 Mongoose closed.");
    process.exit(0);
});

// ============================================================
// 🟢 ROUTES
// ============================================================
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// History Catch-Up Endpoint
app.get("/api/bot/logs/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await Log.find({ userId })
            .sort({ timestamp: -1 })
            .limit(100);
        res.status(200).json(history.map(l => l.message).reverse());
    } catch (err) {
        res.status(500).json({ error: "History sync failed" });
    }
});

app.get("/", (req, res) => res.status(200).send("🚀 NEO-V6 Backend Healthy!"));

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
        socket.join(userId);
        console.log(`🔌 WebSocket: Room joined by ${userId}`);
    }
});

/**
 * 🟢 INTERNAL WEBHOOK BROADCASTER
 * Python calls this to push updates.
 * This handles BOTH 'bot_log' (saved to DB) and 'bot_status_update' (real-time metrics).
 */
app.post('/api/internal/broadcast', async (req, res) => {
    const { userId, type, data } = req.body;
    
    if (!userId || !type || !data) {
        return res.status(400).json({ error: "Missing payload fields" });
    }

    try {
        // 1. Persist to MongoDB only if it's a log message
        if (type === 'bot_log') {
            await Log.create({
                userId,
                message: typeof data === 'string' ? data : JSON.stringify(data),
                level: (typeof data === 'string' && data.includes('🧠')) ? 'thought' : 'info',
                timestamp: new Date()
            });
        }

        // 2. Broadcast the FULL data object to the frontend
        // This ensures PnL, Exposure, and Balance updates reach the UI
        io.to(userId).emit(type, data);
        
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("❌ Broadcast Error:", err.message);
        // Fallback: emit even if DB fails
        io.to(userId).emit(type, data);
        res.status(200).json({ success: true, warning: "DB write failed" });
    }
});

// ============================================================
// 🟢 4. MAINTENANCE
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
        await mongoose.connect(process.env.MONGO_URI);
        startPriceFeed();

        const PORT = process.env.PORT || 10000;
        server.listen(PORT, () => {
            console.log(`🚀 Node Server & WebSocket running on port ${PORT}`);
            setInterval(keepAlive, 300000); 
            setInterval(autoSaveBots, 600000); 
        });
    } catch (err) {
        console.error("Server Start Failed:", err);
        process.exit(1); 
    }
};

startServer();
