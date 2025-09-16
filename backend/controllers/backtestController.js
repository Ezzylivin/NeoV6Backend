// File: src/backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import { runBacktest as serviceRunBacktest, runBatchBacktests as serviceRunBatch } from "../services/backtestService.js";

// --- Get paginated past backtests ---
export const getBacktests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const backtests = await Backtest.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Backtest.countDocuments({ userId: req.user._id });

    res.json({
      backtests,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load past backtests." });
  }
};

// --- Get options for dropdowns ---
export const getBacktestOptions = async (req, res) => {
  try {
    res.json({
      strategies: ["meanReversion", "trendFollowing", "scalping"],
      symbols: ["BTCUSDT", "ETHUSDT", "ADAUSDT", "SOLUSDT"],
      timeframes: ["1m", "5m", "15m", "1h", "4h", "1d"],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load backtest options." });
  }
};

// --- Run single backtest ---
export const runBacktest = async (req, res) => {
  try {
    const payload = req.body;
    const result = await serviceRunBacktest({ userId: req.user._id, ...payload });
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to run backtest." });
  }
};

// --- Run batch backtests ---
export const runBatchBacktests = async (req, res) => {
  try {
    const configs = req.body;
    const results = await serviceRunBatch(req.user._id, configs);
    res.status(201).json({ batchResults: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to run batch backtests." });
  }
};
