// File: src/backend/server.js (Env-Aware CORS + MongoDB + Price Feed)

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import apiRoutes from "./routes/apiRoutes.js";
import priceRoutes from "./routes/priceRoutes.js";
import { startPriceFeed } from "./controllers/priceController.js";

dotenv.config();
const app = express();

// --- Environment-Aware Dynamic CORS ---
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    // Development environment: allow localhost
    if (process.env.NODE_ENV === "development") {
      const allowedLocalOrigins = ["http://localhost:5173", "http://localhost:8000"];
      if (allowedLocalOrigins.includes(origin)) return callback(null, true);
    }

    // Production environment: allow Vercel subdomains
    if (process.env.NODE_ENV === "production") {
      const vercelRegex = /^https:\/\/.*\.vercel\.app$/;
      if (vercelRegex.test(origin)) return callback(null, true);
      // Add more production domains here if needed
      const allowedProdDomains = process.env.ALLOWED_ORIGINS?.split(",");
      if (allowedProdDomains && allowedProdDomains.includes(origin)) return callback(null, true);
    }

    return callback(new Error("This origin is not allowed by CORS"));
  },
  optionsSuccessStatus: 200,
};

// --- Middleware ---
app.use(cors(corsOptions));
app.use(express.json());

// --- API Routes ---
app.use("/api", apiRoutes);
app.use("/api/prices", priceRoutes);

// --- Start server + MongoDB ---
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
