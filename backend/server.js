import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// --- Service Imports ---
import { startPriceFeed } from "./services/priceService.js";

// --- DYNAMIC ROUTE LOADER ---
// Import the central apiRoutes file that loads all other routes.
import apiRoutes from './routes/apiRoutes.js';

dotenv.config();
const app = express();

// --- FLEXIBLE CORS SETUP ---
// This configuration allows Vercel, Netlify, and localhost domains.
const corsOptions = {
  origin: function (origin, callback) {
    // Regular expressions to match preview/production domains
    const vercelRegex = /\.vercel\.app$/;
    const netlifyRegex = /\.netlify\.app$/; // Added Netlify regex

    // Allow localhost, Vercel, Netlify, and requests with no origin (like Postman)
    if (
      !origin ||
      origin.startsWith("http://localhost") ||
      vercelRegex.test(origin) ||
      netlifyRegex.test(origin) // Added Netlify check
    ) {
      callback(null, true);
    } else {
      callback(new Error("Request from this origin is not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- MOUNT ALL API ROUTES ---
// This single line mounts all routes found by your apiRoutes.js file.
app.use("/api", apiRoutes);

// --- Serve Static Files ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// --- Start MongoDB + Server ---
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
