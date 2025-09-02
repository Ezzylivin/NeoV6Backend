// File: src/backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { isValidMarket } from "../utils/validateMarket.js";

// --- Run a backtest ---
export const runBacktest = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk, exchange } = req.body;

    if (!userId || !symbol || !strategy || !exchange) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Validate symbol for the exchange
    const valid = await isValidMarket(exchange, symbol);
    if (!valid) return res.status(400).json({ success: false, message: "Invalid symbol or exchange" });

    // Fetch strategy params if missing
    let strategyParams = strategy.params;
    if (!strategyParams) {
      const storedStrategy = await Strategy.findOne({ userId, name: strategy.name });
      strategyParams = storedStrategy?.params || {};
    }

    // Simulate backtest result
    const simulatedProfit = Math.random() * initialBalance * 0.2;
    const finalBalance = initialBalance + simulatedProfit;

    const backtestEntry = await Backtest.create({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy: strategy.name,
      risk,
      exchange,
      results: { profit: simulatedProfit, finalBalance },
    });

    res.json({ success: true, backtest: backtestEntry });
  } catch (err) {
    console.error("[Run Backtest Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get all backtests for a user ---
export const getUserBacktests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, backtests });
  } catch (err) {
    console.error("[Get User Backtests Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Delete a backtest ---
export const deleteBacktest = async (req, res) => {
  try {
    const { userId, id } = req.params;
    if (!userId || !id) return res.status(400).json({ success: false, message: "Missing fields" });

    await Backtest.deleteOne({ _id: id, userId });
    res.json({ success: true, message: "Backtest deleted" });
  } catch (err) {
    console.error("[Delete Backtest Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Get backtest options ---
export const getBacktestOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      options: {
        symbols: ["BTC/USD", "ETH/USD", "SOL/USD", "BNB/USD", "LTC/USD"], // top US spot pairs
        timeframes: ["1m","5m","15m","30m","1h","4h","1d"],
        balances: [100,500,1000],
        strategies: ["SMA","EMA","RSI","MACD"],
        risks: ["Low","Medium","High"],
      },
    });
  } catch (err) {
    console.error("[Get Backtest Options Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
