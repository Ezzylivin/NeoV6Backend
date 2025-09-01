// File: src/backend/server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import apiRoutes, { mountRoutes } from "./routes/apiRoutes.js";
import priceRoutes from "./routes/priceRoutes.js";
import { startPriceFeed } from "./controllers/priceController.js";

dotenv.config();
const app = express();

// --- Dynamic CORS allowing Vercel frontend ---
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman, mobile apps

    if (process.env.NODE_ENV === "development") {
      const allowedLocalOrigins = ["http://localhost:5173", "http://localhost:8000"];
      if (allowedLocalOrigins.includes(origin)) return callback(null, true);
    }

    if (process.env.NODE_ENV === "production") {
      // Allow any subdomain of anything.vercel.app
      const domainRegex = /^https:\/\/.*\.vercel\.app$/;
      if (domainRegex.test(origin)) return callback(null, true);
    }

    return callback(new Error("This origin is not allowed by CORS"));
  },
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// --- Mount dynamic API routes ---
await mountRoutes();
app.use("/api", apiRoutes);

// --- Price routes ---
app.use("/api/prices", priceRoutes);

// --- Start MongoDB + server ---
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected");

    // Start background price feed
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
