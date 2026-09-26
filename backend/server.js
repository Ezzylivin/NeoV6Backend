// File: backend/server.js
// 🚀 UPGRADE: v14.2 - Corrected Broadcast Logic & Persistent Sync

import mongoose from "mongoose";
import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import axios from "axios"; 
import http from "http"; 
import { Server } from "socket.io"; 
import app from "./app.js"; 
import { startPriceFeed } from "./services/priceService.js";

// 🟢 DB IMPORTS
import Bot from "./dbStructure/bot.js"; 
import Log from "./dbStructure/log.js"; 
import { getBotStatus } from "./services/botService.js";
import { protect } from "./middleware/authMiddleware.js";

dotenv.config();

// NOTE: body parsing + CORS are already configured in app.js.

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

// History Catch-Up Endpoint (auth required; identity from JWT, not the URL param)
app.get("/api/bot/logs/:userId", protect, async (req, res) => {
    try {
        const userId = req.user.id; // ignore :userId param — prevents reading other users' logs
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
const isAllowedOrigin = (origin) => {
    if (!origin) return true; // non-browser clients (server-to-server)
    const vercelRegex = /\.vercel\.app$/;
    const localhostRegex = /^http:\/\/localhost:\d+$/;
    return localhostRegex.test(origin) || vercelRegex.test(origin);
};

const io = new Server(server, {
    cors: {
        origin: (origin, callback) =>
            isAllowedOrigin(origin)
                ? callback(null, true)
                : callback(new Error("Origin not allowed by CORS")),
        methods: ["GET", "POST"],
        credentials: true,
    }
});

// 🔐 Authenticate the socket handshake with the same JWT used for REST.
// The room a client joins is the VERIFIED user id from the token, never a
// client-supplied query param (which would let anyone join any user's room).
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next(new Error("Unauthorized: missing token"));
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = String(decoded.id);
        return next();
    } catch (err) {
        return next(new Error("Unauthorized: invalid token"));
    }
});

io.on('connection', (socket) => {
    const userId = socket.userId; // from the verified JWT
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
    // 🔐 Server-to-server auth: the Python ML service must send a matching
    // x-internal-key header. Enforced when INTERNAL_API_KEY is configured;
    // if it isn't set yet, warn loudly rather than silently allowing anyone.
    const expectedKey = process.env.INTERNAL_API_KEY;
    if (expectedKey) {
        if (req.get('x-internal-key') !== expectedKey) {
            return res.status(401).json({ error: "Unauthorized internal call" });
        }
    } else {
        console.warn("⚠️ INTERNAL_API_KEY not set — /api/internal/broadcast is UNPROTECTED. Set it on both the Node backend and the Python ML service.");
    }

    const { userId, type, data } = req.body;

    // 🟢 DEBUG LOG 1: Data arrived from Mendel (Python)
    console.log(`📥 BRIDGE IN: Received ${type} for user ${userId}`);

    try {
        if (type === 'bot_log') { /* existing log logic */ }

        // 🟢 DEBUG LOG 2: Attempting to send to browser
        const roomSize = io.sockets.adapter.rooms.get(userId)?.size || 0;
        console.log(`📤 BRIDGE OUT: Emitting to room ${userId}. Active listeners: ${roomSize}`);

        io.to(userId).emit(type, data);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("❌ BRIDGE ERROR:", err.message);
        res.status(500).json({ error: "Broadcast failed" });
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
        const runningBots = await Bot.find({ status: 'running' }).select('userId').lean();
        // Refresh bot statuses with bounded concurrency instead of one-by-one
        // (each call is a Python round-trip); avoids serializing into minutes
        // while not hammering the ML service all at once.
        const CONCURRENCY = 5;
        for (let i = 0; i < runningBots.length; i += CONCURRENCY) {
            const batch = runningBots.slice(i, i + CONCURRENCY);
            await Promise.allSettled(batch.map((bot) => getBotStatus(bot.userId)));
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
