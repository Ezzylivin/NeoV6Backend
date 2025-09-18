// File: backend/controllers/backtestController.js
import mongoose from "mongoose";
import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runStrategyService } from "../services/strategyEngineService.js";

// --- Run single backtest ---
export const runBacktestController = async (req, res) => {
  try {
    const { code, params } = req.body;
    const userId = req.user._id;

    const dbStrategy = await Strategy.findOne({
      code,
      userId: new mongoose.Types.ObjectId(userId),
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
      userId: new mongoose.Types.ObjectId(userId),
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

// --- Fetch backtest options ---
export const fetchBacktestOptionsController = async (req, res) => {
  try {
    const userId = req.user._id;

    const strategies = await Strategy.find({ userId })
      .select("_id name code params.symbol params.timeframe params.takeProfit params.stopLoss")
      .lean();

    const symbols = [...new Set(strategies.map(s => s.params.symbol))];
    const timeframes = [...new Set(strategies.map(s => s.params.timeframe))];
    const takeProfits = [...new Set(strategies.map(s => s.params.takeProfit))];
    const stopLosses = [...new Set(strategies.map(s => s.params.stopLoss))];

    res.json({ strategies, symbols, timeframes, takeProfits, stopLosses });
  } catch (err) {
    console.error("Error fetching backtest options:", err);
    res.status(500).json({ error: "Failed to fetch backtest options" });
  }
};

// --- Fetch past backtests with pagination ---
export const fetchPastBacktestsController = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const [backtests, total] = await Promise.all([
      Backtest.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Backtest.countDocuments({ userId }),
    ]);

    res.json({ backtests, total });
  } catch (err) {
    console.error("Error fetching past backtests:", err);
    res.status(500).json({ error: "Failed to fetch past backtests" });
  }
};

// --- Fetch a single backtest by ID ---
export const getBacktestById = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const userId = req.user._id;

    const backtest = await Backtest.findOne({
      _id: new mongoose.Types.ObjectId(backtestId),
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (!backtest) {
      return res.status(404).json({ error: "Backtest not found" });
    }

    res.json(backtest);
  } catch (err) {
    console.error("Error fetching backtest by ID:", err);
    res.status(500).json({ error: "Failed to fetch backtest" });
  }
};

// --- Delete a backtest by ID ---
export const deleteBacktest = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const userId = req.user._id;

    const deleted = await Backtest.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(backtestId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!deleted) {
      return res.status(404).json({ error: "Backtest not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting backtest:", err);
    res.status(500).json({ error: "Failed to delete backtest" });
  }
};

// --- Preview a strategy without saving ---
export const previewStrategyController = async (req, res) => {
  try {
    const { code, params } = req.body;
    const userId = req.user._id;

    const dbStrategy = await Strategy.findOne({
      code,
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (!dbStrategy) {
      return res.status(404).json({ error: "Strategy not found" });
    }

    const result = await runBacktestService(dbStrategy, params, userId, true); // true = previewOnly
    res.json(result);
  } catch (err) {
    console.error("Error previewing strategy:", err);
    res.status(500).json({ error: "Failed to preview strategy" });
  }
};
