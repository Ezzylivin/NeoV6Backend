// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";

/**
 * GET /api/backtests/options
 * Return available options (example: risk levels, strategies, etc.)
 */
export const getBacktestOptions = async (req, res) => {
  try {
    const strategies = await Strategy.find().select("strategyType params name");
    res.json({
      risks: ["Low", "Medium", "High"],
      strategies,
      message: "Backtest options fetched successfully"
    });
  } catch (err) {
    console.error(`[BacktestController] getBacktestOptions error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/backtests/run
 * Run a single backtest
 */
export const runBacktestController = async (req, res) => {
  try {
    const {
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategyId,
      strategy,
      risk,
      takeProfit,
      stopLoss,
      limit,
      startDate,
      endDate,
      useNews,
      tradeConfig
    } = req.body;

    if (!userId || (!symbol && !strategyId)) {
      return res.status(400).json({ error: "Missing required fields: userId and symbol/strategyId" });
    }

    const result = await runBacktest({
      userId,
      strategyId,
      symbol,
      timeframe,
      initialBalance,
      strategy,
      risk,
      takeProfit,
      stopLoss,
      limit,
      startDate,
      endDate,
      useNews,
      tradeConfig
    });

    res.json(result);
  } catch (err) {
    console.error(`[BacktestController] runBacktestController error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/backtests/batch
 * Run multiple backtests in batch
 */
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, paramCombos } = req.body;

    if (!userId || !Array.isArray(paramCombos) || !paramCombos.length) {
      return res.status(400).json({ error: "Missing required fields: userId or paramCombos" });
    }

    const result = await runBatchBacktests(userId, null, paramCombos);

    res.json(result);
  } catch (err) {
    console.error(`[BacktestController] runBatchBacktestsController error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/backtests/user/:userId
 * Fetch all backtests for a user
 */
export const getUserBacktests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ backtests });
  } catch (err) {
    console.error(`[BacktestController] getUserBacktests error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/backtests/:backtestId
 * Fetch a single backtest by ID
 */
export const getBacktestById = async (req, res) => {
  try {
    const { backtestId } = req.params;
    if (!backtestId) return res.status(400).json({ error: "Missing backtestId" });

    const backtest = await Backtest.findById(backtestId);
    if (!backtest) return res.status(404).json({ error: "Backtest not found" });

    res.json({ backtest });
  } catch (err) {
    console.error(`[BacktestController] getBacktestById error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/backtests/:backtestId
 * Remove a backtest
 */
export const deleteBacktest = async (req, res) => {
  try {
    const { backtestId } = req.params;
    if (!backtestId) return res.status(400).json({ error: "Missing backtestId" });

    const deleted = await Backtest.findByIdAndDelete(backtestId);
    if (!deleted) return res.status(404).json({ error: "Backtest not found" });

    await logToDb(deleted.userId, `[Backtest] Deleted backtest ${backtestId} for ${deleted.symbol}`);
    res.json({ message: "Backtest deleted successfully" });
  } catch (err) {
    console.error(`[BacktestController] deleteBacktest error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
