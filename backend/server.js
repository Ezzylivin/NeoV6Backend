import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";

import PriceService from './services/priceService.js'; // ✅ default import
import apiRoutes from './routes/apiRoutes.js';

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

// Connect to DB and start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    // ✅ Start price feed
    PriceService.startPriceFeed();

    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch(err => console.error("MongoDB connection error:", err));
