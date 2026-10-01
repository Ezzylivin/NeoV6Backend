// File: backend/server.js
// 🚀 UPGRADE: v14.2 - Corrected Broadcast Logic & Persistent Sync

import mongoose from "mongoose";
import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import axios from "axios";
import http from "http";
import crypto from "crypto";
import { Server } from "socket.io";
import app from "./app.js"; 
import { startPriceFeed } from "./services/priceService.js";

// 🟢 DB IMPORTS
import Bot from "./dbStructure/bot.js"; 
import Log from "./dbStructure/log.js";
import User from "./dbStructure/user.js";
import { sendTradeAlert } from "./utils/mailer.js";
import { getBotStatus } from "./services/botService.js";
import { protect } from "./middleware/authMiddleware.js";

// Trade-alert email rate guard: at most N emails per user per rolling minute,
// so a burst of fleet entries can't spam an inbox.
const _alertTimes = new Map(); // baseUserId -> [timestamps]
function alertAllowed(id) {
  const now = Date.now();
  const arr = (_alertTimes.get(id) || []).filter((t) => now - t < 60000);
  if (arr.length >= 6) { _alertTimes.set(id, arr); return false; }
  arr.push(now); _alertTimes.set(id, arr); return true;
}

dotenv.config();

// NOTE: body parsing + CORS are already configured in app.js.

const SELF_URL = process.env.VITE_API_URL || "https://neov6backend.onrender.com";
const PYTHON_URL = process.env.ML_SERVER_URL || "http://localhost:8000";

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

// SECURITY (BE#5): prefer an exact-match allowlist from ALLOWED_ORIGINS
// (comma-separated) so production can lock CORS to the app's own domains.
// Falls back to the loose *.vercel.app rule only when no allowlist is set.
const EXACT_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((o) => o.trim()).filter(Boolean);
const isAllowedOrigin = (origin) => {
    if (!origin) return true; // non-browser clients (server-to-server)
    if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
    if (EXACT_ORIGINS.length) return EXACT_ORIGINS.includes(origin);
    return /\.vercel\.app$/.test(origin); // fallback until ALLOWED_ORIGINS is set
};

// Constant-time secret comparison (avoids leaking the key via timing, and
// handles length/undefined safely — timingSafeEqual throws on length mismatch).
const safeKeyEqual = (a, b) => {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
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
    // 🔐 Server-to-server auth (BE#2). FAIL CLOSED: if INTERNAL_API_KEY isn't
    // configured the endpoint is DISABLED rather than open to anyone; when set,
    // the header is compared in constant time.
    const expectedKey = process.env.INTERNAL_API_KEY;
    if (!expectedKey) {
        console.error("❌ INTERNAL_API_KEY not set — /api/internal/broadcast is DISABLED. Set it on both the Node backend and the Python ML service.");
        return res.status(503).json({ error: "Broadcast disabled: server not configured" });
    }
    if (!safeKeyEqual(req.get('x-internal-key'), expectedKey)) {
        return res.status(401).json({ error: "Unauthorized internal call" });
    }

    const { userId, type, data } = req.body;

    // Validate the target + event so a caller can't push an arbitrary client
    // event into an arbitrary user's room.
    const ALLOWED_TYPES = new Set(['bot_log', 'bot_status_update', 'trade_alert']);
    if (typeof userId !== 'string' || !userId || !ALLOWED_TYPES.has(type)) {
        return res.status(400).json({ error: "Invalid broadcast payload" });
    }

    try {
        if (type === 'bot_log') {
            // BE#6: persist so /api/bot/logs/:userId history catch-up works.
            // Non-fatal — a DB hiccup must not stop the live socket emit.
            try {
                const message = typeof data === 'string' ? data : JSON.stringify(data);
                await Log.create({ userId, message, level: 'thought' });
            } catch (logErr) {
                console.error("⚠️ Log persist failed:", logErr.message);
            }
        }

        // 📧 Trade-alert email to the user on file (verified addresses only).
        if (type === 'trade_alert') {
            const baseId = (data && data.baseUserId) || String(userId).split('::')[0];
            // Fire-and-forget: email must never block or fail the broadcast.
            (async () => {
                try {
                    if (!alertAllowed(baseId)) return;
                    const user = await User.findById(baseId).select('email isVerified').lean();
                    if (user && user.email && user.isVerified) {
                        await sendTradeAlert(user.email, data);
                    }
                } catch (e) {
                    console.error("[trade_alert] email failed:", e.message);
                }
            })();
        }

        // Emit to the exact room (single-bot listeners join their bare uid) AND,
        // for FLEET children keyed "<uid>::<symbol>::<side>", also to the base-uid
        // room the browser actually joined — otherwise fleet events never reach the
        // page. Tag the child id on object payloads so the client can route it.
        io.to(userId).emit(type, data);
        const baseId = String(userId).split("::")[0];
        if (baseId && baseId !== userId) {
            const payload = data && typeof data === "object" ? { ...data, _childId: userId } : data;
            io.to(baseId).emit(type, payload);
        }
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
