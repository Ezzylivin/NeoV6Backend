// File: backend/controllers/backtestController.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import Price from "../dbStructure/price.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";

/**
 * A standard helper function for sending consistent API responses.
 */
const sendResponse = (res, data = {}, message = "Success", status = 200) => {
  return res.status(status).json({ success: status < 400, message, data });
};

/**
 * GET /api/backtests/options
 * Gathers all necessary data for the backtesting UI, like symbols and strategies.
 */
export const getBacktestOptions = async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from auth middleware
    const symbols = await Price.distinct("symbol");
    const strategies = await Strategy.find({ userId }).select("name strategyType params").lean();

    return sendResponse(
      res,
      {
        symbols,
        strategies,
        timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
        risks: ["Low", "Medium", "High"],
      },
      "Backtest options fetched successfully"
    );
  } catch (err) {
    console.error(`[getBacktestOptions Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to fetch backtest options", 500);
  }
};

/**
 * POST /api/backtests/run
 * Runs a single backtest and saves the result to the database.
 */
export const runBacktestController = async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from auth middleware
    const {
      symbol,
      timeframe,
      initialBalance,
      strategyId,
      strategy, // A custom strategy object can also be passed
      risk,
      takeProfit,
      stopLoss,
      startDate,
      endDate,
    } = req.body;

    if (!symbol || (!strategyId && !strategy)) {
      return sendResponse(res, {}, "Symbol and either a strategyId or a strategy object are required.", 400);
    }

    let finalStrategy = strategy;
    if (strategyId) {
      const dbStrategy = await Strategy.findById(strategyId).lean();
      if (!dbStrategy) {
        return sendResponse(res, {}, `Strategy with ID ${strategyId} not found.`, 404);
      }
      // Authorization check: Ensure the user owns this strategy
      if (dbStrategy.userId.toString() !== userId) {
        return sendResponse(res, {}, "Not authorized to use this strategy.", 403);
      }
      finalStrategy = {
        name: dbStrategy.name,
        type: dbStrategy.strategyType, // CRITICAL FIX: Pass the 'type' to the service
        parameters: dbStrategy.params,
      };
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
      takeProfit: takeProfit != null ? Number(takeProfit) / 100 : null, // Assuming TP/SL are sent as percentages
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

/**
 * GET /api/backtests/user
 * Retrieves a paginated list of backtests for the authenticated user.
 */
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

/**
 * GET /api/backtests/:backtestId
 * Retrieves a single backtest by its ID.
 */
export const getBacktestById = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const backtest = await Backtest.findById(backtestId).lean();

    if (!backtest) {
      return sendResponse(res, {}, "Backtest not found", 404);
    }

    // Authorization check: Ensure the user owns this backtest
    if (backtest.userId.toString() !== req.user.id) {
        return sendResponse(res, {}, "Not authorized to view this backtest", 403);
    }

    return sendResponse(res, { backtest });
  } catch (err) {
    console.error(`[getBacktestById Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to fetch backtest", 500);
  }
};

/**
 * DELETE /api/backtests/:backtestId
 * Deletes a single backtest by its ID.
 */
export const deleteBacktest = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const backtest = await Backtest.findById(backtestId);

    if (!backtest) {
      return sendResponse(res, {}, "Backtest not found", 404);
    }

    // Authorization check: Ensure the user owns this backtest
    if (backtest.userId.toString() !== req.user.id) {
        return sendResponse(res, {}, "Not authorized to delete this backtest", 403);
    }

    await Backtest.findByIdAndDelete(backtestId);
    await logToDb(req.user.id, `Deleted backtest ${backtestId} for ${backtest.symbol}`);

    return sendResponse(res, {}, "Backtest deleted successfully");
  } catch (err) {
    console.error(`[deleteBacktest Error]: ${err.stack}`);
    return sendResponse(res, { error: err.message }, "Failed to delete backtest", 500);
  }
};
