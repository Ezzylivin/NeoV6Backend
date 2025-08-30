// File: server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

// Load environment variables
dotenv.config();

// Import routes
import backtestRoutes from "./backend/routes/backtestRoutes.js";
import botRoutes from "./backend/routes/botRoutes.js";
import cryptoRoutes from "./backend/routes/cryptoRoutes.js";
import exchangeRoutes from "./backend/routes/exchangeRoutes.js";
import keyRoutes from "./backend/routes/keyRoutes.js";
import logRoutes from "./backend/routes/logRoutes.js";
import priceRoutes from "./backend/routes/priceRoutes.js";
import strategyEngineRoutes from "./backend/routes/strategyEngineRoutes.js";
import userRoutes from "./backend/routes/userRoutes.js";

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("MongoDB URI not found in environment variables!");
  process.exit(1);
}

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("MongoDB connection error:", err));

// Mount routes
app.use("/api/backtests", backtestRoutes);
app.use("/api/bots", botRoutes);
app.use("/api/cryptos", cryptoRoutes);
app.use("/api/exchanges", exchangeRoutes);
app.use("/api/keys", keyRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/prices", priceRoutes);
app.use("/api/strategyengines", strategyEngineRoutes);
app.use("/api/users", userRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
