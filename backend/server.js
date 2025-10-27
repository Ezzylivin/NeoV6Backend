// File: backend/server.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "./app.js"; // Import the configured Express app
import { startPriceFeed } from "./services/priceService.js";

dotenv.config();

// --- Start MongoDB + Server (for local development) ---
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected successfully.");

        startPriceFeed();
        console.log("📈 Background price feed started.");

        const PORT = process.env.PORT || 8000;
        app.listen(PORT, () =>
            console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
        );
    } catch (err) {
        console.error("❌ Server startup failed:", err.message);
        process.exit(1);
    }
};

startServer();
