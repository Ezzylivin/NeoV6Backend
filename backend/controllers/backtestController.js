// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";

/**
 * Utility: Standard API response
 */
const sendResponse = (res, data = {}, message = "Success", status = 200) => {
  return res.status(status).json({ success: status < 400, message, data });
};

/**
 * GET /api/backtests/options
 * Return all available options for frontend selectors
 */
export const getBacktestOptions = async (req, res) => {
  try {
    const strategies = await Strategy.find().select("strategyType params name");
    return sendResponse(res, {
      symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
      timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
      balances: [100, 500, 1000, 5000, 10000],
      risks: ["Low", "Medium", "High"],
      strategies,
      takeProfits: [null, 1, 2, 3, 5, 10],
      stopLosses: [null, 0.5, 1, 2, 3, 5],
      positions: ["Long", "Short", "Both"]
    }, "Backtest options fetched successfully");
  } catch (err) {
    console.error(`[BacktestController] getBacktestOptions error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to fetch backtest options", 500);
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
      useSlippage,
      useSpread,
      useRandomEvents,
      baseSlippageBps,
      positionSide,
      tradeConfig: extraTradeConfig = {}
    } = req.body;

    // Validate required fields
    if (!userId || (!symbol && !strategyId)) {
      return sendResponse(res, {}, "Missing required fields: userId and symbol/strategyId", 400);
    }

    // Validate risk
    const allowedRisks = ["Low", "Medium", "High"];
    const validatedRisk = allowedRisks.includes(risk) ? risk : "Medium";

    // Build unified tradeConfig
    const tradeConfig = {
      useNews: useNews ?? true,
      useSlippage: useSlippage ?? true,
      useSpread: useSpread ?? true,
      useRandomEvents: useRandomEvents ?? true,
      baseSlippageBps: baseSlippageBps ?? 5,
      positionSide: positionSide ?? "Both",
      ...extraTradeConfig
    };

    const result = await runBacktest({
      userId,
      strategyId,
      symbol,
      timeframe,
      initialBalance: Number(initialBalance) || 1000,
      strategy,
      risk: validatedRisk,
      takeProfit: takeProfit != null ? Number(takeProfit) : null,
      stopLoss: stopLoss != null ? Number(stopLoss) : null,
      limit: Number(limit) || 2000,
      startDate,
      endDate,
      tradeConfig
    });

    await logToDb(userId, `[Backtest] Ran ${strategy?.name || "custom"} backtest on ${symbol}`);

    return sendResponse(res, result, "Backtest executed successfully");
  } catch (err) {
    console.error(`[BacktestController] runBacktestController error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to run backtest", 500);
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
      return sendResponse(res, {}, "Missing required fields: userId or paramCombos", 400);
    }

    // Optional: limit max batch size to 20
    const combos = paramCombos.slice(0, 20);

    const result = await runBatchBacktests(userId, null, combos);
    await logToDb(userId, `[Backtest] Ran batch of ${combos.length} backtests`);

    return sendResponse(res, result, "Batch backtests executed successfully");
  } catch (err) {
    console.error(`[BacktestController] runBatchBacktestsController error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to run batch backtests", 500);
  }
};

/**
 * GET /api/backtests/user/:userId
 * Fetch all backtests for a user with optional pagination
 */
export const getUserBacktests = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return sendResponse(res, {}, "Missing userId", 400);

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const backtests = await Backtest.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return sendResponse(res, { backtests, page, limit });
  } catch (err) {
    console.error(`[BacktestController] getUserBacktests error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to fetch user backtests", 500);
  }
};

/**
 * GET /api/backtests/:backtestId
 * Fetch a single backtest by ID
 */
export const getBacktestById = async (req, res) => {
  try {
    const { backtestId } = req.params;
    if (!backtestId) return sendResponse(res, {}, "Missing backtestId", 400);

    const backtest = await Backtest.findById(backtestId);
    if (!backtest) return sendResponse(res, {}, "Backtest not found", 404);

    return sendResponse(res, { backtest });
  } catch (err) {
    console.error(`[BacktestController] getBacktestById error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to fetch backtest", 500);
  }
};

/**
 * DELETE /api/backtests/:backtestId
 * Remove a backtest securely
 */
export const deleteBacktest = async (req, res) => {
  try {
    const { backtestId } = req.params;
    if (!backtestId) return sendResponse(res, {}, "Missing backtestId", 400);

    const backtest = await Backtest.findById(backtestId);
    if (!backtest) return sendResponse(res, {}, "Backtest not found", 404);

    // Only allow deletion if user matches (req.user.id from auth middleware)
    // Example: if (req.user.id !== backtest.userId) return sendResponse(res, {}, "Unauthorized", 403);

    await Backtest.findByIdAndDelete(backtestId);
    await logToDb(backtest.userId, `[Backtest] Deleted backtest ${backtestId} for ${backtest.symbol}`);

    return sendResponse(res, {}, "Backtest deleted successfully");
  } catch (err) {
    console.error(`[BacktestController] deleteBacktest error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to delete backtest", 500);
  }
};
