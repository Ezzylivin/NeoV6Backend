import express from "express";
import {
  runBacktest,
  runBatchBacktests,
  getUserBacktests,
  getBacktestOptions,
} from "../controllers/backtestController.js";

const router = express.Router();

// Run single backtest
router.post("/", runBacktest);

// Run batch backtests
router.post("/batch", runBatchBacktests);

// Get all backtests for a user
router.get("/:userId", getUserBacktests);


// Get selectable options for frontend
router.get("/options/all", getBacktestOptions);

export default router;
