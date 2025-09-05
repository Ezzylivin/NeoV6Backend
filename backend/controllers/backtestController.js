// File: backend/controllers/backtestController.js
import { runBacktest, runBatchBacktests, runRealisticBacktest } from "../services/backtestService.js";
import Backtest from "../dbStructure/backtest.js";

/**
 * Run a single backtest
 */
export const runSingleBacktest = async (req, res) => {
  try {
    const {
      symbol,
      timeframe,
      initialBalance,
      strategy,
      risk,
      takeProfit,
      stopLoss,
      slippageBps,
      limit,
      strategyId,
      startDate,   // ✅ new
      endDate      // ✅ new
    } = req.body;

    const userId = req.user?._id;

    const result = await runBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy,
      risk,
      takeProfit,
      stopLoss,
      slippageBps,
      limit,
      strategyId,
      startDate,   // ✅ pass through
      endDate      // ✅ pass through
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("[Controller] runSingleBacktest failed:", err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Run batch backtests
 */
export const runBatch = async (req, res) => {
  try {
    const { paramCombos, exchange } = req.body;
    const userId = req.user?._id;

    const result = await runBatchBacktests(userId, exchange, paramCombos);
    res.status(200).json(result);
  } catch (err) {
    console.error("[Controller] runBatch failed:", err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Run realistic backtest (alias of runBacktest)
 */
export const runRealistic = async (req, res) => {
  try {
    const {
      symbol,
      timeframe,
      initialBalance,
      strategy,
      risk,
      takeProfit,
      stopLoss,
      slippageBps,
      limit,
      strategyId,
      startDate,   // ✅ new
      endDate      // ✅ new
    } = req.body;

    const userId = req.user?._id;

    const result = await runRealisticBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy,
      risk,
      takeProfit,
      stopLoss,
      slippageBps,
      limit,
      strategyId,
      startDate,   // ✅ pass through
      endDate      // ✅ pass through
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("[Controller] runRealistic failed:", err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all backtests for a user
 */
export const getUserBacktests = async (req, res) => {
  try {
    const userId = req.user?._id;
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json(backtests);
  } catch (err) {
    console.error("[Controller] getUserBacktests failed:", err.message);
    res.status(500).json({ error: err.message });
  }
};
