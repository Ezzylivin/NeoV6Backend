// File: src/backend/routes/backtestRoutes.js
import express from "express";
import { isValidMarket } from "../utils/validateMarket.js";
import {
  runBacktest,
  listBacktests,
  deleteBacktest,
  getBacktestOptions,
  runAndSaveBacktests
} from "../controllers/backtestController.js";

const router = express.Router();

// --- Get options for backtests ---
router.get("/options", getBacktestOptions);

// --- Run a backtest with validation ---
router.post("/run", async (req, res) => {
  const { userId, symbol, strategy, initialBalance, timeframe, risk, exchange = "coinbase" } = req.body;

  try {
    // Validate symbol/exchange
    const valid = await isValidMarket(exchange, symbol);
    if (!valid) return res.status(400).json({ message: `Invalid symbol ${symbol} for exchange ${exchange}` });

    // Delegate to controller to run realistic backtest and save
    return runAndSaveBacktests(req, res);
  } catch (err) {
    console.error("[Run Backtest Route Error]", err);
    res.status(500).json({ message: "Failed to run backtest" });
  }
});

// --- List all backtests for a user ---
router.get("/user/:userId", listBacktests);

// --- Delete a backtest ---
router.delete("/:userId/:id", deleteBacktest);

export default router;
