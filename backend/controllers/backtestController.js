// File: backend/controllers/backtestController.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";

// GET /api/backtests/options
export const getBacktestOptions = async (req, res) => {
  try {
    const symbols = await Price.distinct("symbol");
    res.json({
      success: true,
      options: {
        symbols: symbols.length ? symbols : ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
        timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
        balances: [100, 500, 1000, 5000, 10000],
        strategies: ["SMA", "EMA", "RSI", "MACD", "BollingerBands", "Stochastic", "VWAP", "ATR"],
        risks: ["Low", "Medium", "High"],
        stopLosses: [0.5, 1, 2, 3, 5],
        takeProfits: [1, 2, 3, 5, 10]
      }
    });
  } catch (err) {
    console.error("[Options Error]", err);
    res.status(500).json({ success: false, message: err.message || "Failed to fetch backtest options" });
  }
};

// POST /api/backtests/run
export const runAndSaveBacktests = async (req, res) => {
  try {
    const {
      userId,
      symbol,
      timeframe = "1h",
      initialBalance = 1000,
      strategy = { name: "SMA", parameters: {} },
      risk = "Medium",
      takeProfit = 0,
      stopLoss = 0
    } = req.body;

    if (!userId || !symbol) {
      return res.status(400).json({ success: false, message: "Missing userId or symbol" });
    }

    const normalizedStrategy = typeof strategy === "string" ? { name: strategy, parameters: {} } : strategy;

    const { saved, metrics, equityCurve, trades } = await runBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance: Number(initialBalance),
      strategy: normalizedStrategy,
      risk,
      takeProfit: takeProfit ?? 0,
      stopLoss: stopLoss ?? 0
    });

    // Safe profit logging
    const profit = saved?.profit ?? 0;
    await logToDb(
      userId,
      `[Backtest] ${symbol} | ${timeframe} | Balance: $${initialBalance} | Strategy: ${normalizedStrategy.name} | Risk: ${risk} | TP: ${takeProfit ?? 0} | SL: ${stopLoss ?? 0} | Profit: $${profit.toFixed(2)}`
    );

    res.status(201).json({ success: true, backtest: saved, metrics, equityCurve, trades });
  } catch (err) {
    console.error("[Backtest Run Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal error during backtest" });
  }
};

// POST /api/backtests/batch
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, paramCombos } = req.body;
    if (!userId || !Array.isArray(paramCombos) || paramCombos.length === 0) {
      return res.status(400).json({ success: false, message: "Missing userId or paramCombos" });
    }

    const { results, best } = await runBatchBacktests(userId, "coinbasepro", paramCombos);
    res.json({ success: true, results, best });
  } catch (err) {
    console.error("[Batch Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message || "Batch backtests failed" });
  }
};

// GET /api/backtests/user/:userId
export const getUserBacktests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, backtests });
  } catch (err) {
    console.error("[List Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message || "Failed to fetch user backtests" });
  }
};
