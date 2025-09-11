// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import Price from "../dbStructure/price.js";
import ccxt from "ccxt";
import {
  runBacktest,
  runBatchBacktests,
  STRATEGY_PARAMS_DESCRIPTION,
} from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";

/**
 * Standard API response helper
 */
const sendResponse = (res, data = {}, message = "Success", status = 200) => {
  return res.status(status).json({ success: status < 400, message, data });
};

/**
 * GET /api/backtests/options
 */
export const getBacktestOptions = async (req, res) => {
  try {
    const dbSymbols = await Price.distinct("symbol");

    let liveSymbols = [];
    try {
      const exchange = new ccxt.coinbase();
      const markets = await exchange.loadMarkets();
      liveSymbols = Object.keys(markets).filter((s) => s.endsWith("/USD"));
    } catch (err) {
      console.warn("[BacktestController] Could not fetch live markets:", err.message);
    }

    const symbols = [...new Set([...dbSymbols, ...liveSymbols])].slice(0, 50);

    let strategies = await Strategy.find().select("strategyType params name");
    if (!strategies || strategies.length === 0) {
      strategies = Object.keys(STRATEGY_PARAMS_DESCRIPTION).map((key) => ({
        name: `${key} Strategy`,
        strategyType: key,
        params: STRATEGY_PARAMS_DESCRIPTION[key],
      }));
    }

    return sendResponse(
      res,
      {
        symbols,
        timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
        balances: [100, 500, 1000, 5000, 10000],
        risks: ["Low", "Medium", "High"],
        strategies,
        takeProfits: [null, 1, 2, 3, 5, 10],
        stopLosses: [null, 0.5, 1, 2, 3, 5],
        positions: ["Long", "Short", "Both"],
        availableDates: {}, // optional placeholder for future date ranges
      },
      "Backtest options fetched successfully"
    );
  } catch (err) {
    console.error(`[BacktestController] getBacktestOptions error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to fetch backtest options", 500);
  }
};

/**
 * POST /api/backtests/run
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
      tradeConfig: extraTradeConfig = {},
    } = req.body;

    if (!userId || (!symbol && !strategyId)) {
      return sendResponse(res, {}, "Missing required fields: userId and symbol/strategyId", 400);
    }

    const allowedRisks = ["Low", "Medium", "High"];
    const validatedRisk = allowedRisks.includes(risk) ? risk : "Medium";

    const tradeConfig = {
      useNews: useNews ?? true,
      useSlippage: useSlippage ?? true,
      useSpread: useSpread ?? true,
      useRandomEvents: useRandomEvents ?? false,
      baseSlippageBps: baseSlippageBps ?? 5,
      positionSide: positionSide ?? "Both",
      ...extraTradeConfig,
    };

    const safeInitialBalance = Number(initialBalance) > 0 ? Number(initialBalance) : 1000;
    const safeLimit = Number(limit) || 2000;

    // If strategyId provided, fetch from DB
    let finalStrategy = strategy;
    if (strategyId && !strategy) {
      const dbStrategy = await Strategy.findById(strategyId);
      finalStrategy = dbStrategy ? { name: dbStrategy.name, parameters: dbStrategy.params } : { name: "Default Strategy", parameters: {} };
    }

    const result = await runBacktest({
      userId,
      strategyId,
      symbol,
      timeframe,
      initialBalance: safeInitialBalance,
      strategy: finalStrategy,
      risk: validatedRisk,
      takeProfit: takeProfit != null ? Number(takeProfit) : null,
      stopLoss: stopLoss != null ? Number(stopLoss) : null,
      limit: safeLimit,
      startDate,
      endDate,
      tradeConfig,
    });

    await logToDb(userId, `[Backtest] Ran ${finalStrategy?.name || "custom"} backtest on ${symbol}`);

    return sendResponse(res, result, "Backtest executed successfully");
  } catch (err) {
    console.error(`[BacktestController] runBacktestController error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to run backtest", 500);
  }
};

/**
 * POST /api/backtests/preview-strategy
 * Simulate a backtest for a strategy preview (does NOT save to DB)
 */
export const previewStrategy = async (req, res) => {
  try {
    const {
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy,
      risk,
      takeProfit,
      stopLoss,
      startDate,
      endDate,
      useNews,
      useSlippage,
      useSpread,
      useRandomEvents,
      baseSlippageBps,
      positionSide,
      tradeConfig: extraTradeConfig = {},
    } = req.body;

    if (!userId || !symbol || !strategy?.name) {
      return sendResponse(res, {}, "Missing required fields: userId, symbol, or strategy name", 400);
    }

    const allowedRisks = ["Low", "Medium", "High"];
    const validatedRisk = allowedRisks.includes(risk) ? risk : "Medium";

    const tradeConfig = {
      useNews: useNews ?? true,
      useSlippage: useSlippage ?? true,
      useSpread: useSpread ?? true,
      useRandomEvents: useRandomEvents ?? false,
      baseSlippageBps: baseSlippageBps ?? 5,
      positionSide: positionSide ?? "Both",
      ...extraTradeConfig,
    };

    const safeInitialBalance = Number(initialBalance) > 0 ? Number(initialBalance) : 1000;

    // Run backtest in simulation mode (do NOT save)
    const result = await runBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance: safeInitialBalance,
      strategy,
      risk: validatedRisk,
      takeProfit: takeProfit != null ? Number(takeProfit) : null,
      stopLoss: stopLoss != null ? Number(stopLoss) : null,
      startDate,
      endDate,
      tradeConfig,
      simulateOnly: true, // flag to avoid saving
    });

    // No logging to DB for preview
    return sendResponse(res, result, "Preview executed successfully");
  } catch (err) {
    console.error(`[BacktestController] previewStrategy error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to preview strategy", 500);
  }
};

/**
 * POST /api/backtests/batch
 */
export const runBatchBacktestsController = async (req, res) => {
  try {
    const { userId, paramCombos } = req.body;
    if (!userId || !Array.isArray(paramCombos) || !paramCombos.length) {
      return sendResponse(res, {}, "Missing required fields: userId or paramCombos", 400);
    }

    const limitedCombos = paramCombos.slice(0, 20); // Safety limit
    const result = await runBatchBacktests(userId, null, limitedCombos);

    await logToDb(userId, `[Backtest] Ran batch of ${limitedCombos.length} backtests`);
    return sendResponse(res, result, "Batch backtests executed successfully");
  } catch (err) {
    console.error(`[BacktestController] runBatchBacktestsController error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to run batch backtests", 500);
  }
};

/**
 * GET /api/backtests/user/:userId
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
 */
export const deleteBacktest = async (req, res) => {
  try {
    const { backtestId } = req.params;
    if (!backtestId) return sendResponse(res, {}, "Missing backtestId", 400);

    const backtest = await Backtest.findById(backtestId);
    if (!backtest) return sendResponse(res, {}, "Backtest not found", 404);

    await Backtest.findByIdAndDelete(backtestId);
    await logToDb(backtest.userId, `[Backtest] Deleted backtest ${backtestId} for ${backtest.symbol}`);

    return sendResponse(res, {}, "Backtest deleted successfully");
  } catch (err) {
    console.error(`[BacktestController] deleteBacktest error: ${err.stack}`);
    return sendResponse(res, {}, "Failed to delete backtest", 500);
  }
};
