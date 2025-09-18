// File: backend/controllers/backtestController.js
import mongoose from "mongoose";
import Strategy from "../dbStructure/strategy.js";
import { runBacktest, runBatchBacktests } from "../services/strategyEngineService.js";

// --- Run single backtest ---
export const runBacktestController = async (req, res) => {
  try {
    const { code, params } = req.body;
    const userId = req.user._id;

    const dbStrategy = await Strategy.findOne({
      code,
      userId: new mongoose.Types.ObjectId(userId), // ensure ObjectId
    }).lean();

    if (!dbStrategy) {
      return res.status(404).json({ error: "Strategy not found" });
    }

    const result = await runBacktestService(dbStrategy, params, userId);

    res.json(result);
  } catch (err) {
    console.error("Error running backtest:", err);
    res.status(500).json({ error: "Failed to run backtest" });
  }
};

// --- Run batch backtests ---
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { code, batchParams } = req.body;
    const userId = req.user._id;

    const dbStrategy = await Strategy.findOne({
      code,
      userId: new mongoose.Types.ObjectId(userId), // ensure ObjectId
    }).lean();

    if (!dbStrategy) {
      return res.status(404).json({ error: "Strategy not found" });
    }

    const results = await runBatchBacktestsService(dbStrategy, batchParams, userId);

    res.json(results);
  } catch (err) {
    console.error("Error running batch backtests:", err);
    res.status(500).json({ error: "Failed to run batch backtests" });
  }
};
