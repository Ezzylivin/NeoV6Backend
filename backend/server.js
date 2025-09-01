// File: src/backend/server.js (Auto Subdomain CORS + MongoDB + Price Feed)

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import apiRoutes from "./routes/apiRoutes.js";
import priceRoutes from "./routes/priceRoutes.js";
import { startPriceFeed } from "./controllers/priceController.js";

dotenv.config();
const app = express();

// --- Environment-Aware Dynamic CORS with Auto Subdomain Matching ---
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman, mobile apps, server-to-server

    if (process.env.NODE_ENV === "development") {
      const allowedLocalOrigins = ["http://localhost:5173", "http://localhost:8000"];
      if (allowedLocalOrigins.includes(origin)) return callback(null, true);
    }

    if (process.env.NODE_ENV === "production") {
      // Automatically allow any subdomain of your production domain
      const prodDomain = process.env.PROD_DOMAIN || "vercel.app"; // set in .env if custom domain
      const domainRegex = new RegExp(`^https:\\/\\/.*\\.${prodDomain}$`);
      if (domainRegex.test(origin)) return callback(null, true);

      // Optional: allow exact matches from additional domains in env
      const extraOrigins = process.env.ALLOWED_ORIGINS?.split(",");
      if (extraOrigins && extraOrigins.includes(origin)) return callback(null, true);
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
