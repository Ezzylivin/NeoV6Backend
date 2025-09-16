// File: src/backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktests,
  getBacktestOptions,
  runBacktest,
  runBatchBacktests,
  deleteBacktest,
} from "../controllers/backtestController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- All routes require authentication ---
router.use(authenticateUser);

// GET /api/backtest?page=1 -> fetch past backtests
router.get("/", getBacktests);

// GET /api/backtest/options -> fetch dropdown options
router.get("/options", getBacktestOptions);

// POST /api/backtest -> run a single backtest
router.post("/", runBacktest);

// POST /api/backtest/batch -> run batch backtests
router.post("/batch", runBatchBacktests);

// DELETE /api/backtest/:id -> delete a backtest
router.delete("/:id", deleteBacktest);

export default router;
