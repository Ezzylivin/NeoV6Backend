// File: src/backend/controllers/backtestController.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { runRealisticBacktest } from "../services/backtestService.js";

/**
 * GET available backtest options
 */
export const getBacktestOptions = async (req, res) => {
  try {
    const symbols = await Price.distinct("symbol");

    res.json({
      success: true,
      options: {
        symbols: symbols.length ? symbols : ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
        timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
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

/**
 * POST run a single realistic backtest
 */
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
      backtest: saved,
      metrics,
      equityCurve,
      trades,
    });
  } catch (err) {
    console.error("[Backtest Run Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal error during backtest" });
  }
};

/**
 * POST run batch backtests with different parameter combos
 */
export const runBatchBacktests = async (req, res) => {
  try {
    const { userId, paramCombos } = req.body;
    if (!userId || !paramCombos || !Array.isArray(paramCombos)) {
      return res.status(400).json({ success: false, message: "Missing userId or paramCombos" });
    }

    const results = [];
    for (const params of paramCombos) {
      const { symbol, timeframe, initialBalance, strategy, risk } = params;
      const { saved, metrics } = await runRealisticBacktest({
        userId,
        symbol,
        timeframe,
        initialBalance,
        strategy,
        risk,
      });
      results.push({ saved, metrics });
    }

    // Select the best by profit (you can change this to Sharpe, winRate, etc.)
    const best = results.sort((a, b) => b.metrics.profit - a.metrics.profit)[0];

    res.json({ success: true, results, best });
  } catch (err) {
    console.error("[Batch Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message || "Batch backtests failed" });
  }
};

/**
 * GET list backtests (history)
 */
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
