// File: src/backend/server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import apiRoutes from "./routes/apiRoutes.js";
import priceRoutes from "./routes/priceRoutes.js";
import { startPriceFeed } from "./controllers/priceController.js";

dotenv.config();
const app = express();

// --- Dynamic CORS: allow any Vercel frontend + localhost dev ---
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman, server-to-server

    // Allow any Vercel frontend
    const vercelRegex = /^https:\/\/.*\.vercel\.app$/;
    if (vercelRegex.test(origin)) return callback(null, true);

    // Allow localhost dev
    const allowedLocalOrigins = ["http://localhost:5173", "http://localhost:8000"];
    if (allowedLocalOrigins.includes(origin)) return callback(null, true);

    return callback(new Error("CORS not allowed"));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// --- API routes ---
app.use("/api", apiRoutes);
app.use("/api/prices", priceRoutes);

// --- Connect to MongoDB + start server ---
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected");

    // Start live price feed (background)
    startPriceFeed();

    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () =>
      console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

startServer();
