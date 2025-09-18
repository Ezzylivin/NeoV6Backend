// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  runBacktestController,
  runBatchBacktestsController,
  getBacktestOptions,
  getUserBacktests,
  getBacktestById,
  deleteBacktest,
  previewStrategyController,
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Route for fetching past backtests
router.get("/", protect, getUserBacktests);

// Route for fetching backtest options
router.get("/options", protect, getBacktestOptions);

// ... other routes
router.get("/:backtestId", protect, getBacktestById);
router.post("/run", protect, runBacktestController);
router.post("/batch", protect, runBatchBacktestsController);
router.post("/preview", protect, previewStrategyController);
router.delete("/:backtestId", protect, deleteBacktest);

export default router;
