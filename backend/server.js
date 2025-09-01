// File: src/backend/server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import apiRoutes from "./routes/apiRoutes.js";
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
app.use("/api", apiRoutes);

// --- Serve static files (optional, for testing HTML) ---
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public"))); // put testExchanges.html here

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
