// File: src/backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { isValidMarket } from "../utils/validateMarket.js";

// --- Run a single backtest ---
export const runBacktest = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk, stopLoss, takeProfit, exchange } = req.body;
    if (!userId || !symbol || !strategy || !exchange) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Validate symbol
    const valid = await isValidMarket(exchange, symbol);
    if (!valid) return res.status(400).json({ success: false, message: "Invalid symbol or exchange" });

    // Fetch strategy params if missing
    let strategyParams = strategy.params;
    if (!strategyParams) {
      const storedStrategy = await Strategy.findOne({ userId, name: strategy.name });
      strategyParams = storedStrategy?.params || {};
    }

    // Simulate backtest
    const simulatedProfit = Math.random() * initialBalance * 0.2;
    const finalBalance = initialBalance + simulatedProfit;

    const backtestEntry = await Backtest.create({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy: strategy.name,
      risk,
      stopLoss,
      takeProfit,
      results: { profit: simulatedProfit, finalBalance }
    });

    res.json({ success: true, backtest: backtestEntry });
  } catch (err) {
    console.error("[Run Backtest Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Run batch backtests ---
export const runBatchBacktests = async (req, res) => {
  try {
    const { userId, paramCombos, exchange } = req.body;
    if (!userId || !Array.isArray(paramCombos) || paramCombos.length === 0) {
      return res.status(400).json({ success: false, message: "Missing parameters for batch backtests" });
    }

    let bestBacktest = null;
    const results = [];

    for (const params of paramCombos) {
      const { symbol, timeframe, strategy, risk, stopLoss, takeProfit, initialBalance } = params;

      // Validate symbol
      const valid = await isValidMarket(exchange, symbol);
      if (!valid) continue;

      // Fetch strategy params if missing
      let strategyParams = strategy.params;
      if (!strategyParams) {
        const storedStrategy = await Strategy.findOne({ userId, name: strategy.name });
        strategyParams = storedStrategy?.params || {};
      }

      const simulatedProfit = Math.random() * initialBalance * 0.2;
      const finalBalance = initialBalance + simulatedProfit;

      const saved = await Backtest.create({
        userId,
        symbol,
        timeframe,
        initialBalance,
        strategy: strategy.name,
        risk,
        stopLoss,
        takeProfit,
        results: { profit: simulatedProfit, finalBalance }
      });

      results.push({ ...params, saved });

      // Track best by highest profit
      if (!bestBacktest || saved.results.profit > bestBacktest.results.profit) {
        bestBacktest = saved;
      }
    }

    res.json({ success: true, results, best: bestBacktest });
  } catch (err) {
    console.error("[Batch Backtest Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get all backtests for a user ---
export const getUserBacktests = async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

  const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
  res.json({ success: true, backtests });
};

// --- Get backtest options ---
export const getBacktestOptions = async (req, res) => {
  res.json({
    success: true,
    options: {
      symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
      timeframes: ["1m","5m","15m","30m","1h","4h","1d"],
      balances: [100, 300, 500, 1000, 5000, 10000],
      strategies: ["SMA","EMA","RSI","MACD"],
      risks: ["Low","Medium","High"],
      stopLosses: [0.5, 1, 2, 3, 5],
      takeProfits: [1, 2, 3, 5, 10]
    }
  });
};
