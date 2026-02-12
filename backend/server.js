// File: backend/server.js
// 🚀 UPGRADE: v14.0 - WebSocket Integration + Existing Backtest Logic

import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios"; 
import http from "http"; // 🟢 1. Import HTTP
import { Server } from "socket.io"; // 🟢 2. Import Socket.IO
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
// 🟢 MONGOOSE CONNECTION LISTENERS
// ============================================================

// Monitor the state of the connection to track health
mongoose.connection.on('connected', () => {
    console.log("✅ MongoDB: Connection established.");
});

mongoose.connection.on('error', (err) => {
    console.error(`❌ MongoDB: Connection error occurred: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
    console.warn("⚠️ MongoDB: Connection lost. Reconnecting...");
});

mongoose.connection.on('reconnected', () => {
    console.log("♻️ MongoDB: Connection successfully restored.");
});

// Graceful shutdown: Close connection when app terminates
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log("🛑 Mongoose connection closed due to app termination.");
    process.exit(0);
});

// ============================================================
// 🟢 NEW ROUTES: Fixes the 404 Heartbeat Error
// ============================================================

app.get("/api/health", (req, res) => {
    res.status(200).json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        service: "NEO-V6 Backend" 
    });
});

app.get("/", (req, res) => {
    res.status(200).send("🚀 NEO-V6 Backend is Running & Healthy!");
});

// ============================================================
// 🟢 3. WEBSOCKET SETUP (The Bridge)
// ============================================================

// Wrap Express app in HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins (Frontend Vercel URL)
        methods: ["GET", "POST"]
    }
});

// Socket Connection Logic
io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    if (userId) {
        console.log(`🔌 WebSocket: User connected ${userId}`);
        socket.join(userId); // Join private room for targeted updates
    }

    socket.on('disconnect', () => {
        // console.log(`❌ WebSocket: User disconnected ${userId}`);
    });
});

// 🟢 INTERNAL WEBHOOK: Python calls this to push updates
app.post('/api/internal/broadcast', (req, res) => {
    const { userId, type, data } = req.body;
    
    // Validate payload
    if (!userId || !type || !data) {
        return res.status(400).json({ error: "Missing userId, type, or data" });
    }

    // Broadcast to the specific user's room
    io.to(userId).emit(type, data);
    
    res.status(200).json({ success: true, message: `Broadcasted ${type} to ${userId}` });
});

// ============================================================
// 🟢 4. HEARTBEAT (Keeps Servers Awake)
// ============================================================
const keepAlive = async () => {
    try {
        await axios.get(`${SELF_URL}/api/health`);
        console.log(`[Heartbeat] 💓 Node.js active.`);

        try {
            await axios.get(`${PYTHON_URL}/docs`); 
            console.log(`[Heartbeat] 🐍 Python Engine active.`);
        } catch (pyErr) {
             console.log(`[Heartbeat] ⚠️ Python Ping failed: ${pyErr.message}`);
        }
    } catch (error) {
        if (process.env.NODE_ENV === 'production') {
            console.error(`[Heartbeat] ⚠️ Self-Ping failed: ${error.message}`);
        }
    }
};

// ------------------------------------------------------------
// 🟢 5. AUTO-SAVE (The "Scribe" - Saves Data Every 10 Mins)
// ------------------------------------------------------------
const autoSaveBots = async () => {
    try {
        const runningBots = await Bot.find({ status: 'running' }).select('userId');
        if (runningBots.length === 0) return;

        console.log(`[Auto-Save] 💾 Syncing data for ${runningBots.length} active bots...`);

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
        // Options like serverSelectionTimeoutMS help manage retry behavior
        const connectionOptions = {
            serverSelectionTimeoutMS: 5000, // Fail fast if Atlas is unreachable
        };

        await mongoose.connect(process.env.MONGO_URI, connectionOptions);
        
        startPriceFeed();
        console.log("📈 Background price feed started.");

        const PORT = process.env.PORT || 10000;
        
        // 🟢 CHANGE: app.listen -> server.listen (for WebSockets)
        server.listen(PORT, () => {
            console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
            
            // Heartbeat (Every 5 Minutes)
            setInterval(keepAlive, 300000); 
            setTimeout(keepAlive, 10000); 

            // Auto-Save (Every 10 Minutes)
            setInterval(autoSaveBots, 600000); 
        });

    } catch (err) {
        console.error("❌ Server startup failed:", err.message);
        process.exit(1); 
    }
};

startServer();
