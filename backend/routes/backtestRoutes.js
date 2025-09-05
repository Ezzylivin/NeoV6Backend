// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runSingleBacktest,
  runBatch,
  runRealistic,
  getUserBacktests
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Fetch options for frontend dropdowns
router.get("/options", protect, getBacktestOptions);

// Single backtest
router.post("/single", protect, runSingleBacktest);

// Batch backtests
router.post("/batch", protect, runBatch);

// Realistic backtest
router.post("/realistic", protect, runRealistic);

// User backtests
router.get("/user/:userId", protect, getUserBacktests);

export default router;
