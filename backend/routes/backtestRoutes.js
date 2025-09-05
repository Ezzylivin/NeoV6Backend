// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runSingleBacktest,
  runBatch,
  runRealistic,
  getUserBacktests
} from "../controllers/backtestController.js";

const router = express.Router();

// --- GET options for dropdowns in frontend ---
router.get("/options", getBacktestOptions);

// --- Single backtest ---
router.post("/run", runSingleBacktest);

// --- Batch backtests ---
router.post("/batch", runBatch);

// --- Realistic backtest ---
router.post("/realistic", runRealistic);

// --- Get all backtests for a user ---
router.get("/user/:userId", getUserBacktests);

export default router;
