// File: src/backend/routes/backtestRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getBacktestOptions,
  runAndSaveBacktests,
  runBatchBacktestsController,
  getUserBacktests
} from "../controllers/backtestController.js";

const router = express.Router();

// Get backtest options
// GET /api/backtests/options
router.get("/options", protect, getBacktestOptions);

// Run single backtest
// POST /api/backtests/run
router.post("/run", protect, runAndSaveBacktests);

// Run batch backtests
// POST /api/backtests/batch
router.post("/batch", protect, runBatchBacktestsController);

// Get all backtests for a user
// GET /api/backtests/user/:userId
router.get("/user/:userId", protect, getUserBacktests);

export default router;
