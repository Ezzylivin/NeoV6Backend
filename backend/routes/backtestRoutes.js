// File: src/backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runAndSaveBacktests,
  listBacktests,
  deleteBacktest
} from "../controllers/backtestController.js";

const router = express.Router();

// --- Get options for backtests ---
router.get("/options", getBacktestOptions);

// --- Run and save backtest ---
router.post("/run", runAndSaveBacktests);

// --- List all backtests for a user ---
router.get("/user/:userId", listBacktests);

// --- Delete a backtest ---
router.delete("/:userId/:id", deleteBacktest);

export default router;
