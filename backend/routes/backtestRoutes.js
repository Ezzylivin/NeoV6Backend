// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  createBacktest,
  runBacktest,
  runBatchBacktests,
  getBacktestOptions,
  // getBacktestsByUser,  <-- removed because not exported in controller
} from "../controllers/backtestController.js";

const router = express.Router();

// Create a new backtest
router.post("/", createBacktest);

// Run a single backtest
router.post("/run", runBacktest);

// Run batch backtests
router.post("/batch", runBatchBacktests);

// Get backtest options
router.get("/options", getBacktestOptions);

// 🚨 If you later implement `getBacktestsByUser` in the controller, add it back:
// router.get("/user/:userId", getBacktestsByUser);

export default router;
