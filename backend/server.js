// File: src/backend/server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import apiRoutes from "./routes/apiRoutes.js";
import { startPriceFeed } from "./controllers/priceController.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();

// --- CORS setup ---
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman, mobile apps

    if (process.env.NODE_ENV === "development") {
      const allowedLocalOrigins = ["http://localhost:5173", "http://localhost:8000"];
      if (allowedLocalOrigins.includes(origin)) return callback(null, true);
    }

    if (process.env.NODE_ENV === "production") {
      // Allow any Vercel frontend domain
      if (origin.includes(".vercel.app")) return callback(null, true);
    }

    return callback(new Error("This origin is not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // handle preflight requests

// --- JSON parser ---
app.use(express.json());

// --- Mount API routes ---
app.use("/api", apiRoutes);

// --- Serve static files (optional) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public"))); // e.g., testExchanges.html

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
