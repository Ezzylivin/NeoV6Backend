// File: backend/server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// --- Corrected Imports ---
// Import the service, not the controller, for background tasks
import { startPriceFeed } from "./services/priceService.js";

// Import all the individual, finalized route files
import userRoutes from './routes/userRoutes.js';
import backtestRoutes from './routes/backtestRoutes.js';
import strategyRoutes from './routes/strategyRoutes.js';
import botRoutes from './routes/botRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import logRoutes from './routes/logRoutes.js';

dotenv.config();
const app = express();

// --- Simplified and More Secure CORS Setup ---
const allowedOrigins = [
  // Your Vite frontend development URL
  "http://localhost:5173", 
  // Your production frontend URL from environment variables
  process.env.CORS_ORIGIN 
].filter(Boolean); // filter(Boolean) removes any falsy values (e.g., if CORS_ORIGIN is not set)

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // This is important for sending cookies or auth headers
};

app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- Mount All API Routes ---
// Each feature area of your API is now cleanly mounted on its own path.
app.use("/api/users", userRoutes);
app.use("/api/backtests", backtestRoutes);
app.use("/api/strategies", strategyRoutes);
app.use("/api/bots", botRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/logs", logRoutes);

// --- Serve Static Files (if you have a public folder) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// --- Start MongoDB + Server ---
const startServer = async () => {
  try {
    // The new Mongoose driver doesn't require the old options
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected successfully.");

    // Start the background price feed from the service layer
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
