// File: src/backend/routes/backtestRoutes.js
import express from "express";
import {
  createBacktest,
  getAllBacktests,
  getBacktestsByUser,
  runBatchBacktests,
} from "../controllers/backtestController.js";

const router = express.Router();

// ✅ Batch route
router.post("/batch", runBatchBacktests);

// ✅ Create single backtest
router.post("/", createBacktest);

// ✅ Get ALL backtests
router.get("/", getAllBacktests);

// ✅ FIX: Get backtests by user (needed for TradingBot.jsx)
router.get("/user/:userId", getBacktestsByUser);

export default router;
