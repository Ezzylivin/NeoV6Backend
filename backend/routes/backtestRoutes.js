// File: src/backend/routes/backtestRoutes.js
import express from "express";
import { runBacktest, getUserBacktests, deleteBacktest, getBacktestOptions } from "../controllers/backtestController.js";

const router = express.Router();

// --- Get options for backtests ---
router.get("/options", getBacktestOptions);

// --- Run backtest ---
router.post("/run", runBacktest);

// --- List all backtests for a user ---
router.get("/user/:userId", getUserBacktests);

// --- Delete a backtest ---
router.delete("/:userId/:id", deleteBacktest);

export default router;
