// backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runSingleBacktest,   // single = /run
  runBatch,           // batch = /batch
  runRealistic,       // realistic = /realistic
  getUserBacktests,   // history
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Options ---
router.get("/options", protect, getBacktestOptions);

// --- Single Backtest ---
router.post("/run", protect, runSingleBacktest);

// --- Batch Backtests ---
router.post("/batch", protect, runBatch);

// --- Realistic Backtest ---
router.post("/realistic", protect, runRealistic);

// --- User Backtest History ---
router.get("/user/:userId", protect, getUserBacktests);

export default router;
