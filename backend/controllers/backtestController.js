// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import { logToDb } from "../services/logService.js";

function generateTradeBreakdown(initialBalance) {
  const trades = [];
  const tradeCount = Math.floor(Math.random() * 10) + 5;
  let balance = initialBalance;

  for (let i = 0; i < tradeCount; i++) {
    const entryPrice = +(Math.random() * 100 + 10).toFixed(2);
    const exitPrice = +(entryPrice * (1 + (Math.random() * 0.2 - 0.1))).toFixed(2);
    const profit = +(exitPrice - entryPrice).toFixed(2);
    balance += profit;

    trades.push({
      entryTime: new Date(Date.now() - (tradeCount - i) * 60000),
      exitTime: new Date(Date.now() - (tradeCount - i - 1) * 60000),
      entryPrice,
      exitPrice,
      position: Math.random() > 0.5 ? "long" : "short",
      profit,
      duration: Math.floor(Math.random() * 60),
      result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven",
    });
  }

  return trades;
}

// Run and save backtests
export const runAndSaveBacktests = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk } = req.body;

    if (!userId || !symbol || !timeframe || !initialBalance) {
      return res.status(400).json({
        success: false,
        message: "userId, symbol, timeframe, and initialBalance are required",
      });
    }

    const tradeBreakdown = generateTradeBreakdown(initialBalance);
    const totalProfit = tradeBreakdown.reduce((sum, t) => sum + t.profit, 0);
    const finalBalance = +(initialBalance + totalProfit).toFixed(2);

    const backtestResult = await Backtest.create({
      userId,
      symbol,
      timeframe,
      initialBalance,
      finalBalance,
      profit: totalProfit,
      totalTrades: tradeBreakdown.length,
      candlesTested: tradeBreakdown.length * 10,
      strategy: { name: strategy || "default", parameters: {} },
      tradeBreakdown,
      risk: risk || "medium",
      createdAt: new Date(),
    });

    await logToDb(
      userId,
      `[Backtest] ${symbol} | ${timeframe} | Balance: $${initialBalance} | Strategy: ${strategy} | Risk: ${risk} | Profit: $${backtestResult.profit}`
    );

    res.status(201).json({
      success: true,
      message: "Backtest completed",
      backtests: [backtestResult],
    });
  } catch (error) {
    console.error("[Backtest Error]", error);
    res.status(500).json({ success: false, message: "Failed to run backtests" });
  }
};

// Fetch backtests by user
export const getBacktestsByUser = async (req, res) => {
  try {
    const { userId, symbol, timeframe } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const query = { userId };
    if (symbol) query.symbol = symbol;
    if (timeframe) query.timeframe = timeframe;

    const backtests = await Backtest.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      backtests,
    });
  } catch (error) {
    console.error("[Get Backtests Error]", error);
    res.status(500).json({ success: false, message: "Failed to retrieve backtests" });
  }
};

// Get dropdown options
export const getBacktestOptions = (req, res) => {
  try {
    const options = {
      symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
      timeframes: ["1m", "5m", "15m", "1h", "4h", "1d"],
      balances: [100, 300, 500, 1000, 5000, 10000],
      strategies: ["SMA", "EMA", "RSI", "MACD"],
      risks: ["Low", "Medium", "High"],
    };
    res.json({ success: true, options });
  } catch (err) {
    console.error("[BacktestController] Error fetching options:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
