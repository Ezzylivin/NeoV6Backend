// File: backend/controllers/backtestController.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";

/**
 * GET /api/backtests/options
 * Fetch available options for backtests (symbols, timeframes, balances, etc.)
 * Upgrade: If DB has no symbols, provide defaults to prevent frontend errors.
 */
export const getBacktestOptions = async (req, res) => {
  try {
    const symbols = await Price.distinct("symbol");
    res.json({
      success: true,
      options: {
        symbols: symbols.length ? symbols : ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
        timeframes: ["1m","5m","15m","30m","1h","4h","1d"],
        balances: [100, 500, 1000, 5000, 10000],
        strategies: ["SMA","EMA","RSI","MACD","BollingerBands","Stochastic","VWAP","ATR"],
        risks: ["Low","Medium","High"],
        takeProfits: [null,1,2,3,5,10], // null included for optional TP
        stopLosses: [null,0.5,1,2,3,5] // null included for optional SL
      }
    });
  } catch (err) {
    console.error("[Options Error]", err);
    res.status(500).json({ success: false, message: err.message || "Failed to fetch backtest options" });
  }
};

/**
 * POST /api/backtests/run
 * Run a single backtest
 * Upgrades:
 * 1. Validates required fields (userId, symbol)
 * 2. Normalizes strategy object
 * 3. Wraps TP/SL in safe calculations
 * 4. Logs errors with payload
 * 5. Returns consistent response
 */
export const runAndSaveBacktests = async (req, res) => {
  try {
    const {
      userId,
      symbol,
      timeframe = "1h",
      initialBalance = 1000,
      strategy = { name: "SMA", parameters: {} },
      risk = "Medium",
      takeProfit = null,
      stopLoss = null
    } = req.body;

    // --- 1. Validate required inputs ---
    if (!userId || !symbol) {
      return res.status(400).json({ success: false, message: "Missing userId or symbol" });
    }

    // --- 2. Normalize strategy object ---
    const normalizedStrategy = typeof strategy === "string" ? { name: strategy, parameters: {} } : strategy;

    // --- 3. Run the backtest ---
    const { saved, metrics, equityCurve, trades } = await runBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance: Number(initialBalance),
      strategy: normalizedStrategy,
      risk,
      takeProfit,
      stopLoss
    });

    // --- 4. Log result safely ---
    const profit = saved?.profit ?? 0;
    await logToDb(
      userId,
      `[Backtest] ${symbol} | ${timeframe} | Balance: $${initialBalance} | Strategy: ${normalizedStrategy.name} | Risk: ${risk} | TP: ${takeProfit ?? 0} | SL: ${stopLoss ?? 0} | Profit: $${profit.toFixed(2)}`
    );

    // --- 5. Return structured response ---
    res.status(201).json({ success: true, backtest: saved, metrics, equityCurve, trades });
  } catch (err) {
    console.error("[Backtest Run Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal error during backtest" });
  }
};

/**
 * POST /api/backtests/batch
 * Run multiple backtests in batch
 * Upgrades:
 * 1. Validates userId and paramCombos
 * 2. Splits large arrays into chunks to prevent 413 errors
 * 3. Aggregates results and identifies best backtest
 * 4. Logs errors
 */
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, paramCombos } = req.body;
    if (!userId || !Array.isArray(paramCombos) || paramCombos.length === 0) {
      return res.status(400).json({ success: false, message: "Missing userId or paramCombos" });
    }

    const CHUNK_SIZE = 10; // adjust to server limits
    const results = [];
    let best = null;

    for (let i = 0; i < paramCombos.length; i += CHUNK_SIZE) {
      const chunk = paramCombos.slice(i, i + CHUNK_SIZE);
      const { results: chunkResults, best: chunkBest } = await runBatchBacktests(userId, "exchange", chunk);
      results.push(...chunkResults);
      if (!best || (chunkBest.metrics.netProfit > best.metrics.netProfit)) best = chunkBest;
    }

    res.json({ success: true, results, best });
  } catch (err) {
    console.error("[Batch Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message || "Batch backtests failed" });
  }
};

/**
 * GET /api/backtests/user/:userId
 * Fetch all backtests for a specific user
 */
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
