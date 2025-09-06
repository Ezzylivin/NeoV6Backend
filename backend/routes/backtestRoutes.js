// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runBacktestController,
  runBatchBacktestsController,
  getUserBacktests,
  getBacktestById,
  deleteBacktest
} from "../controllers/backtestController.js";

const router = express.Router();

// GET available options (risks, strategies, etc.)
router.get("/options", getBacktestOptions);

// POST run a single backtest
router.post("/run", runBacktestController);

// POST run batch backtests
router.post("/batch", runBatchBacktestsController);

// GET all backtests for a specific user
router.get("/user/:userId", getUserBacktests);

// GET a single backtest by ID
router.get("/:backtestId", getBacktestById);

// DELETE a backtest by ID
router.delete("/:backtestId", deleteBacktest);

export default router;
