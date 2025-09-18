// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  runBacktestController,
  runBatchBacktestsController,
  fetchBacktestOptionsController,
  fetchPastBacktestsController,
  getBacktestById,
  deleteBacktest,
  previewStrategyController,
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Route for fetching past backtests (paginated)
router.get("/", protect, fetchPastBacktestsController);

// Route for fetching backtest options
router.get("/options", protect, fetchBacktestOptionsController);

// Route for fetching a single backtest by ID
router.get("/:backtestId", protect, getBacktestById);

// Route for running a single backtest
router.post("/run", protect, runBacktestController);

// Route for running batch backtests
router.post("/batch", protect, runBatchBacktestsController);

// Route for previewing a strategy without saving
router.post("/preview", protect, previewStrategyController);

// Route for deleting a backtest
router.delete("/:backtestId", protect, deleteBacktest);

export default router;
