// File: src/backend/controllers/backtestController.js
import BacktestModel from "../models/backtestModel.js";

// --- Get paginated past backtests ---
export const getBacktests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const backtests = await BacktestModel.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BacktestModel.countDocuments({ user: req.user._id });

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

// --- Get options for dropdowns (symbols, strategies, timeframes) ---
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

// --- Run a single backtest ---
export const runBacktest = async (req, res) => {
  try {
    const payload = req.body;
    // TODO: Implement actual backtest logic here
    const newBacktest = await BacktestModel.create({
      user: req.user._id,
      ...payload,
      result: {}, // Placeholder for result
    });

    res.status(201).json(newBacktest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to run backtest." });
  }
};

// --- Run batch backtests ---
export const runBatchBacktests = async (req, res) => {
  try {
    const configs = req.body; // Array of backtest configs
    const results = [];

    for (let payload of configs) {
      const bt = await BacktestModel.create({
        user: req.user._id,
        ...payload,
        result: {}, // Placeholder
      });
      results.push(bt);
    }

    res.status(201).json({ batchResults: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to run batch backtests." });
  }
};

// --- Delete a backtest ---
export const deleteBacktest = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BacktestModel.findOneAndDelete({
      _id: id,
      user: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Backtest not found." });
    }

    res.json({ message: "Backtest deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete backtest." });
  }
};
