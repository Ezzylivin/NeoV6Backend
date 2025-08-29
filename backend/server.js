// File: src/backend/server.js
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import userRoutes from './routes/userRoutes.js';
import botRoutes from './routes/botRoutes.js';
import backtestRoutes from './routes/backtestRoutes.js';
import priceRoutes from './routes/priceRoutes.js';
import { startPriceFeed } from './services/priceService.js';

dotenv.config();

// --- Express App ---
const app = express();

// --- Middleware ---
const corsOptions = {
  origin: function (origin, callback) {
    const whitelist = ['http://localhost:3000', 'http://localhost:5173'];
    const vercelRegex = /^https:\/\/.*\.vercel\.app$/;

    if (!origin || whitelist.indexOf(origin) !== -1 || vercelRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('This origin is not allowed by CORS'));
    }
  }
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

// --- API Routes ---
app.use("/api", apiRoutes); // for live price endpoints

// --- Connect DB and Start Server ---
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    // Start Binance live price feed
    startPriceFeed();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => console.error("MongoDB connection error:", err));
