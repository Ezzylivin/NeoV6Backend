// File: backend/controllers/backtestController.js
// FULLY Python-free version

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";
import { getBacktestOptionsData as fetchDataOptions } from "../services/backtestDataService.js";

// Helper: standardized success response
const sendResponse = (res, data = {}, message = "Success") => {
    return res.status(200).json({ success: true, message, data });
};

// Helper: standardized error response
const sendError = (res, error, controllerName) => {
    console.error(`[Controller Error: ${controllerName}]`, error);
    res.status(500).json({
        success: false,
        message: error.message || "An internal server error occurred."
    });
};

// Fetch backtest options: symbols, timeframes, and user's strategies
export const getBacktestOptions = async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch user's strategies from DB
        const strategies = await Strategy.find({ userId }).select("name params").lean();

        // Fetch symbols and timeframes from local service
        const optionsData = await fetchDataOptions();
        const symbols = optionsData.symbols || [];
        const timeframes = optionsData.timeframes || [];

        return sendResponse(res, { symbols, timeframes, strategies }, "Backtest options fetched successfully");
    } catch (err) {
        sendError(res, err, 'getBacktestOptions');
    }
};

// Run a single backtest
export const runBacktestController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { strategyId, ...restOfBody } = req.body;

        if (!strategyId) {
            return res.status(400).json({ success: false, message: "A strategyId is required." });
        }

        // Fetch strategy from DB
        const dbStrategy = await Strategy.findById(strategyId).lean();
        if (!dbStrategy) return res.status(404).json({ success: false, message: `Strategy with ID ${strategyId} not found.` });
        if (dbStrategy.userId.toString() !== userId) return res.status(403).json({ success: false, message: "Not authorized to use this strategy." });

        const finalStrategy = {
            name: dbStrategy.name,
            type: dbStrategy.params.strategyType,
            parameters: dbStrategy.params
        };

        // Execute backtest using Node.js service
        const result = await runBacktest({ userId, ...restOfBody, strategy: finalStrategy });

        return sendResponse(res, result, "Backtest executed successfully");
    } catch (err) {
        sendError(res, err, 'runBacktestController');
    }
};

// Preview strategy without committing
export const previewStrategyController = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await runBacktest({ ...req.body, userId, simulateOnly: true });
        return sendResponse(res, result, "Preview executed successfully");
    } catch (err) {
        sendError(res, err, 'previewStrategyController');
    }
};

// Run batch backtests
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

// Get user's past backtests with pagination
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

// Get backtest by ID
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

// Delete a backtest
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
