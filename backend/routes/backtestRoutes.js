// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  runSingleBacktest,
  runBatchBacktests,
  getUserBacktests,
  runRealisticBacktest
} from "../controllers/backtestController.js";

const router = express.Router();

// Single backtest
router.post("/single", runSingleBacktest);

// Batch backtests
router.post("/batch", runBatchBacktests);

// Realistic backtest
router.post("/realistic", runRealisticBacktest);

// Get all backtests for a user
router.get("/user/:userId", getUserBacktests);

export default router;
