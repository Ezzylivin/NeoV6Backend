// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import Price from "../dbStructure/price.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";

const sendResponse = (res, data = {}, message = "Success", status = 200) => {
  return res.status(status).json({ success: status < 400, message, data });
};

export const getBacktestOptions = async (req, res) => {
  try {
    const userId = req.user.id;
    const symbols = await Price.distinct("symbol");
    const strategies = await Strategy.find({ userId }).select("name strategyType params").lean();
    return sendResponse(res, { symbols, strategies, timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"], risks: ["Low", "Medium", "High"] }, "Backtest options fetched");
  } catch (err) {
    console.error(`[getBacktestOptions Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to fetch backtest options", 500);
  }
};

export const runBacktestController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol, timeframe, initialBalance, strategyId, strategy, risk, takeProfit, stopLoss, startDate, endDate } = req.body;

    if (!symbol || (!strategyId && !strategy)) {
      return sendResponse(res, {}, "Symbol and either a strategyId or a strategy object are required.", 400);
    }

    let finalStrategy = strategy;
    if (strategyId) {
      const dbStrategy = await Strategy.findById(strategyId).lean();
      if (!dbStrategy) return sendResponse(res, {}, `Strategy with ID ${strategyId} not found.`, 404);
      if (dbStrategy.userId.toString() !== userId) return sendResponse(res, {}, "Not authorized to use this strategy.", 403);
      finalStrategy = { name: dbStrategy.name, type: dbStrategy.strategyType, parameters: dbStrategy.params };
    }
    
    if (!finalStrategy || !finalStrategy.type) {
        return sendResponse(res, {}, "A valid strategy with a 'type' property is required.", 400);
    }

    const result = await runBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance: Number(initialBalance) || 10000,
      strategy: finalStrategy,
      risk,
      takeProfit: takeProfit != null ? Number(takeProfit) / 100 : null,
      stopLoss: stopLoss != null ? Number(stopLoss) / 100 : null,
      startDate,
      endDate,
    });

    await logToDb(userId, `Backtest completed for ${finalStrategy.name} on ${symbol}`);
    return sendResponse(res, result, "Backtest executed successfully");
  } catch (err) {
    console.error(`[runBacktestController Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to run backtest", 500);
  }
};

export const previewStrategyController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol, timeframe, initialBalance, strategy, risk, takeProfit, stopLoss, startDate, endDate } = req.body;

    if (!symbol || !strategy || !strategy.type) {
      return sendResponse(res, {}, "Symbol and a valid strategy object with a 'type' are required.", 400);
    }
    
    const result = await runBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance: Number(initialBalance) || 10000,
      strategy,
      risk,
      takeProfit: takeProfit != null ? Number(takeProfit) / 100 : null,
      stopLoss: stopLoss != null ? Number(stopLoss) / 100 : null,
      startDate,
      endDate,
      simulateOnly: true, // This flag prevents saving to the database
    });

    return sendResponse(res, result, "Preview executed successfully");
  } catch (err) {
    console.error(`[previewStrategyController Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to run preview", 500);
  }
};

export const runBatchBacktestsController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { configs } = req.body;

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return sendResponse(res, {}, "An array of 'configs' is required.", 400);
    }
    
    const limitedConfigs = configs.slice(0, 50);
    const batchResult = await runBatchBacktests(userId, limitedConfigs);
    return sendResponse(res, batchResult, "Batch backtests executed successfully");
  } catch (err) {
    console.error(`[runBatchBacktestsController Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to run batch backtests", 500);
  }
};

export const getUserBacktests = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const total = await Backtest.countDocuments({ userId });
    return sendResponse(res, { backtests, page, limit, total });
  } catch (err) {
    console.error(`[getUserBacktests Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to fetch user backtests", 500);
  }
};

export const getBacktestById = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const backtest = await Backtest.findById(backtestId).lean();

    if (!backtest) return sendResponse(res, {}, "Backtest not found", 404);
    if (backtest.userId.toString() !== req.user.id) return sendResponse(res, {}, "Not authorized", 403);
    return sendResponse(res, { backtest });
  } catch (err) {
    console.error(`[getBacktestById Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to fetch backtest", 500);
  }
};

export const deleteBacktest = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const backtest = await Backtest.findById(backtestId);

    if (!backtest) return sendResponse(res, {}, "Backtest not found", 404);
    if (backtest.userId.toString() !== req.user.id) return sendResponse(res, {}, "Not authorized", 403);

    await Backtest.findByIdAndDelete(backtestId);
    await logToDb(req.user.id, `Deleted backtest ${backtestId}`);
    return sendResponse(res, {}, "Backtest deleted successfully");
  } catch (err) {
    console.error(`[deleteBacktest Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to delete backtest", 500);
  }
};
