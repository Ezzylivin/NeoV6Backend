// File: src/backend/routes/backtestRoutes.js
import express from "express";
import {
  runBacktest,
  runBatchBacktests,
  getUserBacktests,
  getBacktestOptions
} from "../controllers/backtestController.js";

const router = express.Router();

// Run a single backtest
router.post("/run", runBacktest);

// Run batch backtests
router.post("/batch", runBatchBacktests);

// Get all backtests for a user
router.get("/user/:userId", getUserBacktests);

// Get dropdown/options for backtests
router.get("/options", getBacktestOptions);

export default router;
