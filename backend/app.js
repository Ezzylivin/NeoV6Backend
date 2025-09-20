// File: backend/app.js

import express from "express";
import cors from "cors";
import apiRoutes from './routes/apiRoutes.js';

const app = express();

// --- FIXED FLEXIBLE CORS SETUP ---
const corsOptions = {
  origin: function (origin, callback) {
    const vercelRegex = /\.vercel\.app$/;
    const netlifyRegex = /\.netlify\.app$/;

    if (
      !origin || // allow tools like Postman
      origin.startsWith("http://localhost") ||
      vercelRegex.test(origin) ||
      netlifyRegex.test(origin)
    ) {
      callback(null, origin); // ✅ echo back the origin instead of "true"
    } else {
      callback(new Error("❌ Request from this origin is not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- Routes ---
app.use("/api", apiRoutes);

export default app;
