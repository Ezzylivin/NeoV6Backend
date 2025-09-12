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
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:8000",
  // Add any other dev URLs here
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Development
    if (process.env.NODE_ENV === "development" && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Production: allow all Vercel frontends
    if (process.env.NODE_ENV === "production" && origin.includes(".vercel.app")) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // allow cookies / JWT
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // handle preflight requests

// --- JSON parser with increased payload limit ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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
