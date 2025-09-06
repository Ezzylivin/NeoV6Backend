// File: backend/controllers/backtestController.js
import mongoose from "mongoose";
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import {
  runBacktest,
  runBatchBacktests,
  runRealisticBacktest,
} from "../services/backtestService.js";
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
        takeProfits: [null, 1, 2, 3, 5, 10],
        stopLosses: [null, 0.5, 1, 2, 3, 5],
      },
    });
  } catch (err) {
    console.error("[Options Error]", err);
    res.status(500).json({ success: false, message: err.message || "Failed to fetch backtest options" });
  }
};

// POST /api/backtests/run
export const runAndSaveBacktests = async (req, res) => {
  try {
    let {
      userId,
      symbol,
      timeframe = "1h",
      initialBalance = 1000,
      strategy = { name: "SMA", parameters: {} },
      risk = "Medium",
      takeProfit = null,
      stopLoss = null,
      limit = 2000,
      startDate,
      endDate,
    } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing userId" });
    }
    if (!symbol) {
      return res.status(400).json({ success: false, message: "Missing symbol" });
    }

    // Normalize numeric inputs
    initialBalance = Number(initialBalance) || 0;
    takeProfit = takeProfit != null ? Number(takeProfit) : null;
    stopLoss = stopLoss != null ? Number(stopLoss) : null;
    const normalizedStrategy = typeof strategy === "string" ? { name: strategy, parameters: {} } : strategy;

    const { saved, metrics, equityCurve, trades, truncated } = await runBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy: normalizedStrategy,
      risk,
      takeProfit,
      stopLoss,
      limit,
      startDate,
      endDate,
    });

    // Ensure saved object always exists for frontend
    const safeSaved = saved || {
      tradeBreakdown: [],
      equityCurve: [],
      symbol,
      strategy: normalizedStrategy,
      profit: 0,
      finalBalance: initialBalance,
      totalTrades: 0,
    };

    const profit = safeSaved.profit || 0;
    await logToDb(
      userId,
      `[Backtest] ${symbol} | ${timeframe} | Balance: $${initialBalance} | Strategy: ${normalizedStrategy.name} | Risk: ${risk} | TP: ${takeProfit ?? 0} | SL: ${stopLoss ?? 0} | Profit: $${profit.toFixed(2)}`
    );

    res.status(201).json({ success: true, saved: safeSaved, metrics, equityCurve, trades, truncated });
  } catch (err) {
    console.error("[Backtest Run Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal error during backtest" });
  }
};

// POST /api/backtests/batch
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, symbol, timeframe = "1h", initialBalance = 1000, limit = 2000 } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing userId" });
    }
    if (!symbol) {
      return res.status(400).json({ success: false, message: "Missing symbol" });
    }

    const batchResults = await runBatchBacktests({ userId, symbol, timeframe, initialBalance, limit });

    // Normalize each result
    const results = batchResults.map(r => {
      const safeSaved = r.saved || {
        tradeBreakdown: [],
        equityCurve: [],
        symbol,
        strategy: r.strategy || { name: "SMA", parameters: {} },
        profit: 0,
        finalBalance: initialBalance,
        totalTrades: 0,
      };
      return {
        saved: safeSaved,
        metrics: r.metrics || { netProfit: 0, winRate: 0, maxDrawdown: 0, tradesCount: 0 },
        equityCurve: r.equityCurve || safeSaved.equityCurve,
        trades: r.trades || safeSaved.tradeBreakdown,
      };
    });

    // Determine best result
    const best = results.reduce(
      (prev, curr) => (curr.metrics.netProfit > (prev?.metrics?.netProfit || -Infinity) ? curr : prev),
      null
    );

    res.status(201).json({ success: true, results, best, usedCombos: batchResults.map(r => r.combo || {}) });
  } catch (err) {
    console.error("[Batch Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal error during batch backtests" });
  }
};

// POST /api/backtests/realistic
export const runRealisticBacktestsController = async (req, res) => {
  try {
    let {
      userId,
      symbol,
      timeframe = "1h",
      initialBalance = 1000,
      strategy = { name: "SMA", parameters: {} },
      risk = "Medium",
      takeProfit = null,
      stopLoss = null,
      limit = 2000,
      startDate,
      endDate,
    } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing userId" });
    }
    if (!symbol) {
      return res.status(400).json({ success: false, message: "Missing symbol" });
    }

    initialBalance = Number(initialBalance) || 0;
    takeProfit = takeProfit != null ? Number(takeProfit) : null;
    stopLoss = stopLoss != null ? Number(stopLoss) : null;
    const normalizedStrategy = typeof strategy === "string" ? { name: strategy, parameters: {} } : strategy;

    const { saved, metrics, equityCurve, trades, truncated } = await runRealisticBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy: normalizedStrategy,
      risk,
      takeProfit,
      stopLoss,
      limit,
      startDate,
      endDate,
    });

    const safeSaved = saved || {
      tradeBreakdown: [],
      equityCurve: [],
      symbol,
      strategy: normalizedStrategy,
      profit: 0,
      finalBalance: initialBalance,
      totalTrades: 0,
    };

    res.status(201).json({ success: true, saved: safeSaved, metrics, equityCurve, trades, truncated });
  } catch (err) {
    console.error("[Realistic Backtest Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal error during realistic backtest" });
  }
};

// GET /api/backtests/user/:userId
export const getUserBacktests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, backtests });
  } catch (err) {
    console.error("[Get User Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message || "Failed to fetch user backtests" });
  }
};
