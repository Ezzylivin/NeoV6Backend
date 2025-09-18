// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  runBacktestController,
  fetchBacktestOptionsController,
  fetchPastBacktestsController,
  getBacktestById,
  deleteBacktest,
  previewStrategyController,
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Fetch paginated past backtests ---
router.get("/", protect, fetchPastBacktestsController);

// --- Fetch dropdown options for backtests ---
router.get("/options", protect, fetchBacktestOptionsController);

// --- Run a single backtest ---
router.post("/run", protect, runBacktestController);

// --- Preview a strategy without saving ---
router.post("/preview", protect, previewStrategyController);

// --- Fetch a single backtest by ID ---
router.get("/:backtestId", protect, getBacktestById);

// --- Delete a backtest by ID ---
router.delete("/:backtestId", protect, deleteBacktest);

export default router;
