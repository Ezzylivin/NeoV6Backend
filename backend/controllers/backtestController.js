import { runBacktest, runRealisticBacktest } from "../services/backtestService.js";
import Backtest from "../dbStructure/backtest.js";

export const runSingleBacktest = async (req, res) => {
  try {
    const { userId, strategy, symbol, timeframe, initialBalance, risk, takeProfit, stopLoss, startDate, endDate } = req.body;
    const result = await runBacktest({
      userId, strategy, symbol, timeframe, initialBalance, risk, takeProfit, stopLoss, startDate, endDate
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const runRealistic = async (req, res) => {
  try {
    const { userId, strategy, symbol, timeframe, initialBalance, risk, takeProfit, stopLoss, startDate, endDate } = req.body;
    const result = await runRealisticBacktest({
      userId, strategy, symbol, timeframe, initialBalance, risk, takeProfit, stopLoss, startDate, endDate
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const runBatchBacktests = async (req, res) => {
  try {
    const { userId, combos } = req.body; // combos: [{symbol, timeframe, strategy, risk, tp, sl}]
    const results = [];
    for (const combo of combos) {
      try {
        const result = await runBacktest({
          userId,
          symbol: combo.symbol,
          timeframe: combo.timeframe,
          strategy: combo.strategy,
          risk: combo.risk,
          takeProfit: combo.tp,
          stopLoss: combo.sl,
          startDate: combo.startDate,
          endDate: combo.endDate
        });
        results.push(result);
      } catch (err) {
        console.warn(`Failed backtest for combo ${combo.symbol}: ${err.message}`);
      }
    }
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getUserBacktests = async (req, res) => {
  try {
    const userId = req.params.userId;
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json(backtests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
