import express from "express";
import {
  getBacktestOptions,
  runBacktestController,
  runBatchBacktestsController,
  getUserBacktests,
  getBacktestById,
  deleteBacktest
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET /api/backtest?page=1 -> fetch past backtests
router.get("/", getUserBacktests);

// GET /api/backtest/options -> fetch dropdown options
router.get("/options", getBacktestOptions);

// POST /api/backtest -> run a single backtest
router.post("/", runBacktestController);

// POST /api/backtest/batch -> run batch backtests
router.post("/batch", runBatchBacktestsController);

// GET /api/backtest/:backtestId -> get single backtest
router.get("/:backtestId", getBacktestById);

// DELETE /api/backtest/:backtestId -> delete a backtest
router.delete("/:backtestId", deleteBacktest);

export default router;
