import axios from 'axios';
import Strategy from "../dbStructure/strategy.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";

const sendResponse = (res, data = {}, message = "Success") => {
  return res.status(200).json({ success: true, message, data });
};

const sendError = (res, error, controllerName) => {
    console.error(`[Controller Error: ${controllerName}]`, error);
    res.status(500).json({ 
        success: false, 
        message: error.message || "An internal server error occurred." 
    });
};

export const getBacktestOptions = async (req, res) => {
  try {
    const userId = req.user.id;
    const symbols = await Price.distinct("symbol");
    const strategies = await Strategy.find({ userId }).select("name params").lean();
    return sendResponse(res, { 
        symbols: symbols.length > 0 ? symbols : ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'], 
        strategies, 
        timeframes: ["15m", "1h", "4h", "1d"], 
    }, "Backtest options fetched successfully");
  } catch (err) {
    sendError(res, err, 'getBacktestOptions');
  }
};

export const runBacktestController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { strategyId, ...restOfBody } = req.body;

    if (!strategyId) {
      return res.status(400).json({ success: false, message: "A strategyId is required." });
    }

    // **UPGRADE**: This logic routes the request based on the selected strategy.
    if (strategyId === 'python_sma_crossover') {
      console.log('Routing request to Python backtest service...');
      const pythonServiceUrl = process.env.PYTHON_SERVICE_URL;
      if (!pythonServiceUrl) throw new Error("Python service URL is not configured.");

      const response = await axios.post(`${pythonServiceUrl}/api/run-backtest`, req.body);
      
      const mappedResult = {
        metrics: {
          totalReturn: response.data.total_return_percent,
          winRate: response.data.sharpe_ratio, // Using Sharpe as a proxy for this metric field
          totalTrades: response.data.total_trades
        }
      };
      
      return sendResponse(res, mappedResult, "Python backtest executed successfully");

    } else {
      // This is your original logic for database-driven strategies.
      console.log(`Routing to Node.js backtest service for strategyId: ${strategyId}`);
      
      const dbStrategy = await Strategy.findById(strategyId).lean();
      if (!dbStrategy) return res.status(404).json({ success: false, message: `Strategy with ID ${strategyId} not found.` });
      if (dbStrategy.userId.toString() !== userId) return res.status(403).json({ success: false, message: "Not authorized to use this strategy." });
        
      const finalStrategy = { 
          name: dbStrategy.name, 
          type: dbStrategy.params.strategyType, 
          parameters: dbStrategy.params 
      };

      const result = await runBacktest({ userId, ...restOfBody, strategy: finalStrategy });

      return sendResponse(res, result, "Backtest executed successfully");
    }
  } catch (err) {
    sendError(res, err, 'runBacktestController');
  }
};

export const previewStrategyController = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await runBacktest({ ...req.body, userId, simulateOnly: true });
    return sendResponse(res, result, "Preview executed successfully");
  } catch (err) {
    sendError(res, err, 'previewStrategyController');
  }
};

export const runBatchBacktestsController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { configs } = req.body;
    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ success: false, message: "Request body must contain a 'configs' array." });
    }
    const limitedConfigs = configs.slice(0, 50); 
    const batchResult = await runBatchBacktests(userId, limitedConfigs);
    return sendResponse(res, batchResult, "Batch backtests executed successfully");
  } catch (err) {
    sendError(res, err, 'runBatchBacktestsController');
  }
};

export const getUserBacktests = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const total = await Backtest.countDocuments({ userId });
    
    return sendResponse(res, { backtests, page, limit, total });
  } catch (err) {
    sendError(res, err, 'getUserBacktests');
  }
};

export const getBacktestById = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const backtest = await Backtest.findById(backtestId).lean();

    if (!backtest) return res.status(404).json({ success: false, message: "Backtest not found" });
    if (backtest.userId.toString() !== req.user.id) return res.status(403).json({ success: false, message: "Not authorized" });
    
    return sendResponse(res, { backtest });
  } catch (err) {
    sendError(res, err, 'getBacktestById');
  }
};

export const deleteBacktest = async (req, res) => {
  try {
    const { backtestId } = req.params;
    const result = await Backtest.deleteOne({ _id: backtestId, userId: req.user.id });

    if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: "Backtest not found or you do not have permission to delete it" });
    }
    await logToDb(req.user.id, `Deleted backtest ${backtestId}`);
    return sendResponse(res, {}, "Backtest deleted successfully");
  } catch (err) {
    sendError(res, err, 'deleteBacktest');
  }
};
