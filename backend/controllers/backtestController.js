// src/backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { isValidMarket } from "../utils/validateMarket.js";

export const runBacktest = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk, exchange } = req.body;

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

    const simulatedProfit = Math.random() * initialBalance * 0.2;
    const finalBalance = initialBalance + simulatedProfit;

    const backtestEntry = await Backtest.create({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy: strategy.name,
      risk,
      results: { profit: simulatedProfit, finalBalance },
    });

    res.json({ success: true, backtest: backtestEntry });
  } catch (err) {
    console.error("[Run Backtest Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
