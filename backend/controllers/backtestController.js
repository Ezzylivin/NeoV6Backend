// File: backend/controllers/backtestController.js
import mongoose from "mongoose";
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js"; // This might not be needed if not directly interacting with Backtest model here
import { runBacktest, runBatchBacktests, runRealisticBacktest } from "../services/backtestService.js";
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
      slippageBps = 5, // Added slippageBps to be passed
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
    initialBalance = Number(initialBalance);
    takeProfit = takeProfit != null ? Number(takeProfit) : null;
    stopLoss = stopLoss != null ? Number(stopLoss) : null;
    slippageBps = Number(slippageBps) || 5; // Normalize slippage
    limit = Number(limit) || 2000;

    const normalizedStrategy = typeof strategy === "string" ? { name: strategy, parameters: {} } : strategy;

    // Convert date strings to Date objects if they exist
    const parsedStartDate = startDate ? new Date(startDate) : null;
    const parsedEndDate = endDate ? new Date(endDate) : null;

    const { saved, metrics, equityCurve, trades } = await runBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy: normalizedStrategy,
      risk,
      takeProfit,
      stopLoss,
      slippageBps, // Pass slippage
      limit,
      startDate: parsedStartDate, // ✅ Pass parsed dates
      endDate: parsedEndDate,     // ✅ Pass parsed dates
    });

    const profit = saved?.profit != null && !isNaN(saved.profit) ? saved.profit : 0;
    await logToDb(
      userId,
      `[Backtest] ${symbol} | ${timeframe} | Balance: $${initialBalance} | Strategy: ${normalizedStrategy.name} | Risk: ${risk} | TP: ${takeProfit ?? 0} | SL: ${stopLoss ?? 0} | Profit: $${profit.toFixed(2)} | Dates: ${startDate ?? 'N/A'} - ${endDate ?? 'N/A'}`
    );

    res.status(201).json({ success: true, backtest: saved, metrics, equityCurve, trades });
  } catch (err) {
    console.error("[Backtest Run Error]", err);
    res.status(500).json({ success: false, message: err.message || "Internal error during backtest" });
  }
};

// POST /api/backtests/realistic (New route for runRealisticBacktest)
export const runRealisticBacktestController = async (req, res) => {
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
      slippageBps = 5,
      limit = 2000,
      startDate,
      endDate,
    } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing userId" });
