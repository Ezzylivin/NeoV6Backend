// File: src/backend/routes/backtestRoutes.js
import express from "express";
import {
  runAndSaveBacktests,
  runBatchBacktestsController,
  getBacktestOptions,
  getUserBacktests,
} from "../controllers/backtestController.js";

const router = express.Router();

// --- GET /api/backtests/options ---
// Fetch all backtest options (symbols, timeframes, balances, strategies, risks)
router.get("/options", getBacktestOptions);

// --- POST /api/backtests/run ---
// Run and save a single backtest
router.post("/run", runAndSaveBacktests);

// --- POST /api/backtests/batch ---
// Run multiple backtests in batch
router.post("/batch", runBatchBacktestsController);

// --- GET /api/backtests/user/:userId ---
// Fetch all backtests for a specific user
router.get("/user/:userId", getUserBacktests);

export default router;
