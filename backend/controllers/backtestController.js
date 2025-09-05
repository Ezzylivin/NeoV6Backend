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
      takeProfits: [null, 1, 2, 3, 5, 10],
      stopLosses: [null, 0.5, 1, 2, 3, 5],
    };

    res.json({ success: true, options });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * ✅ Single backtest
 */
export async function runSingleBacktest(req, res) {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) return res.status(401).json({ success: false, message: "User not authenticated" });

    const result = await runBacktest({ ...req.body, userId });

    // Ensure frontend can read metrics & saved object
    res.json({
      success: true,
      saved: result.saved || result, // if your service returns full backtest object
      metrics: result.metrics || {},
      equityCurve: result.equityCurve || [],
      trades: result.trades || [],
    });
  } catch (err) {
    console.error("[Run Single Backtest Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * ✅ Batch backtests
 */
export async function runBatch(req, res) {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) return res.status(401).json({ success: false, message: "User not authenticated" });

    const result = await runBatchBacktests(userId, req.body.exchange, req.body.paramCombos);
    res.json({ success: true, result });
  } catch (err) {
    console.error("[Run Batch Backtests Error]", err);
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
    res.json({ success: true, backtests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

