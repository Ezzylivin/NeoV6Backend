import express from "express";
import {
  getBacktestOptions,
  runAndSaveBacktests,          // single = /run
  runBatchBacktestsController,  // batch = /batch
  runRealisticBacktestsController, // realistic = /realistic
  getUserBacktests,             // history
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Options ---
router.get("/options", protect, getBacktestOptions);

// --- Single Backtest ---
router.post("/run", protect, runAndSaveBacktests);

// --- Batch Backtests ---
router.post("/batch", protect, runBatchBacktestsController);

// --- Realistic Backtest ---
router.post("/realistic", protect, runRealisticBacktestsController);

// --- User Backtest History ---
router.get("/user/:userId", protect, getUserBacktests);

export default router;
