// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import { logToDb } from "../services/logService.js";

/**
 * Run and save backtests for a user
 */
export const runAndSaveBacktests = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk } = req.body;

    if (!userId || !symbol || !timeframe || !initialBalance) {
      return res.status(400).json({
        message: "userId, symbol, timeframe, and initialBalance are required",
      });
    }

    // Simple mock backtest logic (replace with real strategy)
    const profitPct = (Math.random() * 20 - 10).toFixed(2); // -10% to +10%
    const finalBalance = +(initialBalance * (1 + profitPct / 100)).toFixed(2);

    const backtestResult = await Backtest.create({
      userId,
      symbol,
      timeframe,
      initialBalance,
      finalBalance,
      profit: +(finalBalance - initialBalance).toFixed(2),
      strategy: strategy || "default",
      risk: risk || "medium",
      totalTrades: Math.floor(Math.random() * 20) + 5,
      candlesTested: Math.floor(Math.random() * 500) + 100,
      createdAt: new Date(),
    });

    await logToDb(
      userId,
      `[Backtest] ${symbol} | ${timeframe} | Balance: $${initialBalance} | Strategy: ${strategy} | Risk: ${risk} | Profit: $${backtestResult.profit}`
    );

    res.status(201).json({
      message: "Backtest completed",
      backtests: [backtestResult],
    });
  } catch (error) {
    console.error("[Backtest Error]", error);
    res.status(500).json({ message: "Failed to run backtests" });
  }
};

/**
 * Fetch backtests for a user
 */
export const getBacktestsByUser = async (req, res) => {
  try {
    const { userId, symbol, timeframe } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    let query = { userId };
    if (symbol) query.symbol = symbol;
    if (timeframe) query.timeframe = timeframe;

    const backtests = await Backtest.find(query).sort({ createdAt: -1 });
    res.status(200).json(backtests);
  } catch (error) {
    console.error("[Get Backtests Error]", error);
    res.status(500).json({ message: "Failed to retrieve backtests" });
  }
};

/**
 * Get dropdown options for backtests
 */
export const getBacktestOptions = (req, res) => {
  try {
    const options = {
      symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
      timeframes: ["1m", "5m", "15m", "1h", "4h", "1d"],
      balances: [100, 500, 1000, 5000, 10000],
      strategies: ["SMA", "EMA", "RSI", "MACD"],
      risks: ["Low", "Medium", "High"],
    };
    res.json({ success: true, options });
  } catch (err) {
    console.error("[BacktestController] Error fetching options:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
