// File: backend/controllers/backtestController.js
import { runBacktest, runBatchBacktests, runRealisticBacktest } from "../services/backtestService.js";
import Backtest from "../dbStructure/backtest.js";

/**
 * ✅ Backtest options (used by frontend dropdowns)
 */
export async function getBacktestOptions(req, res) {
  try {
    const options = {
      symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
      timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
      balances: [100, 500, 1000, 5000, 10000],
      risks: ["Low", "Medium", "High"],
      strategies: ["SMA", "EMA", "RSI", "MACD", "BOLLINGERBANDS", "STOCHASTIC", "VWAP", "ATR"],
    };

    res.json(options);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * ✅ Single backtest
 */
export async function runSingleBacktest(req, res) {
  try {
    const result = await runBacktest({ ...req.body, userId: req.user?.id || req.body.userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * ✅ Batch backtests
 */
export async function runBatch(req, res) {
  try {
    const result = await runBatchBacktests(req.user?.id || req.body.userId, req.body.exchange, req.body.paramCombos);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * ✅ Realistic backtest
 */
export async function runRealistic(req, res) {
  try {
    const result = await runRealisticBacktest({ ...req.body, userId: req.user?.id || req.body.userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * ✅ Get all backtests for a user
 */
export async function getUserBacktests(req, res) {
  try {
    const userId = req.params.userId || req.user?.id;
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json(backtests);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
