// backend/controllers/backtestController.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { runRealisticBacktest } from "../services/backtestService.js";

// Keep your options endpoint the same (minor cleanup)
export const getBacktestOptions = async (req, res) => {
  try {
    const symbols = await Price.distinct("symbol");
    res.json({
      success: true,
      options: {
        symbols: symbols.length ? symbols : ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
        timeframes: ["1m", "5m", "10m", "15m", "30m", "1h", "4h", "1d", "3d"],
        balances: [100, 500, 1000, 5000, 10000],
        strategies: ["SMA", "EMA", "RSI", "MACD"],
        risks: ["Low", "Medium", "High"],
      },
    });
  } catch (err) {
    console.error("[Options Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// New: realistic run + save
export const runAndSaveBacktests = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk } = req.body;
    if (!userId || !symbol || !timeframe || initialBalance == null) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const { saved, metrics, equityCurve, trades } = await runRealisticBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance: Number(initialBalance),
      strategy,
      risk,
    });

    return res.status(201).json({
      success: true,
      backtests: [saved],
      metrics,
      equityCurve, // [{time: Date, equity: number}]
      trades,
    });
  } catch (err) {
    console.error("[Backtest Internal Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal server error during backtest" });
  }
};

// Keep your “list backtests” route working as before for charts/history
export const listBacktests = async (req, res) => {
  try {
    const { userId } = req.query;
    const backtests = await Backtest.find(userId ? { userId } : {}).sort({ createdAt: -1 });
    res.json({ success: true, backtests });
  } catch (err) {
    console.error("[List Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
