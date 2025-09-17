// File: backend/controllers/backtestController.js
// UPGRADED: Uses strategyCode instead of ObjectId for strategy lookup.

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";
import { getBacktestOptionsData as fetchDataOptions } from "../services/backtestDataService.js";
import { getStrategiesService } from "../services/strategyEngineService.js";

// --- Helper Functions ---
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

// Validate date ranges by timeframe
const validateDates = (start, end, timeframe) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate) || isNaN(endDate)) throw new Error("Invalid date format.");
    if (startDate >= endDate) throw new Error("Start date must be before end date.");

    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    const limits = { '1m': 30, '5m': 90, '15m': 180, '1h': 365, '4h': 730, '1d': 3650 };

    if (diffDays > (limits[timeframe] || 365)) {
        throw new Error(`Selected date range too large for ${timeframe} timeframe.`);
    }
};

// --- Controller Functions ---

// Fetch backtest options
export const getBacktestOptions = async (req, res) => {
    try {
        const userId = req.user.id;
        const strategies = await getStrategiesService(userId);
        const optionsData = await fetchDataOptions();

        return sendResponse(res, {
            symbols: optionsData.symbols || [],
            timeframes: optionsData.timeframes || [],
            strategies,
            takeProfits: [0.5, 1, 2, 5, 10],
            stopLosses: [0.5, 1, 2, 5, 10]
        }, "Backtest options fetched successfully");
    } catch (err) { sendError(res, err, 'getBacktestOptions'); }
};

// Run single backtest
export const runBacktestController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { strategyCode, startDate, endDate, timeframe, takeProfit, stopLoss, ...rest } = req.body;

        if (!strategyCode) return res.status(400).json({ success: false, message: "strategyCode required" });
        validateDates(startDate, endDate, timeframe);

        // FIX: find by strategyCode, not ObjectId
        const dbStrategy = await Strategy.findOne({ code: strategyCode, userId }).lean();
        if (!dbStrategy) return res.status(404).json({ success: false, message: "Strategy not found" });

        const result = await runBacktest({
            userId,
            startDate,
            endDate,
            timeframe,
            strategy: dbStrategy,
            tp: takeProfit,
            sl: stopLoss,
            ...rest
        });

        return sendResponse(res, result, "Backtest executed successfully");

    } catch (err) { sendError(res, err, 'runBacktestController'); }
};

// Run batch backtests
export const runBatchBacktestsController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { configs } = req.body;
        if (!Array.isArray(configs) || configs.length === 0) {
            return res.status(400).json({ success: false, message: "configs array required" });
        }

        const limitedConfigs = configs.slice(0, 50);
        limitedConfigs.forEach(cfg => validateDates(cfg.startDate, cfg.endDate, cfg.timeframe));

        // FIX: ensure each config is mapped to strategyCode
        const batchConfigs = [];
        for (const cfg of limitedConfigs) {
            const strategy = await Strategy.findOne({ code: cfg.strategyCode, userId }).lean();
            if (!strategy) throw new Error(`Strategy ${cfg.strategyCode} not found`);
            batchConfigs.push({ ...cfg, strategy });
        }

        const batchResult = await runBatchBacktests(userId, batchConfigs);
        return sendResponse(res, batchResult, "Batch backtests executed successfully");

    } catch (err) { sendError(res, err, 'runBatchBacktestsController'); }
};

// Preview strategy
export const previewStrategyController = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await runBacktest({ ...req.body, userId, simulateOnly: true });
        return sendResponse(res, result, "Preview executed successfully");
    } catch (err) { sendError(res, err, 'previewStrategyController'); }
};

// Past backtests
export const getUserBacktests = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const backtests = await Backtest.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Backtest.countDocuments({ userId });

        return sendResponse(res, { backtests, page, limit, total });
    } catch (err) { sendError(res, err, 'getUserBacktests'); }
};

// Backtest by ID
export const getBacktestById = async (req, res) => {
    try {
        const backtest = await Backtest.findById(req.params.backtestId).lean();
        if (!backtest) return res.status(404).json({ success: false, message: "Backtest not found" });
        if (backtest.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }
        return sendResponse(res, { backtest });
    } catch (err) { sendError(res, err, 'getBacktestById'); }
};

// Delete backtest
export const deleteBacktest = async (req, res) => {
    try {
        const { backtestId } = req.params;
        const result = await Backtest.deleteOne({ _id: backtestId, userId: req.user.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: "Backtest not found or unauthorized" });
        }
        await logToDb(req.user.id, `Deleted backtest ${backtestId}`);
        return sendResponse(res, {}, "Backtest deleted successfully");
    } catch (err) { sendError(res, err, 'deleteBacktest'); }
};
// File: backend/controllers/backtestController.js
// UPGRADED: Uses strategyCode instead of ObjectId for strategy lookup.

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runBacktest, runBatchBacktests } from "../services/backtestService.js";
import { logToDb } from "../services/logService.js";
import { getBacktestOptionsData as fetchDataOptions } from "../services/backtestDataService.js";
import { getStrategiesService } from "../services/strategyEngineService.js";

// --- Helper Functions ---
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

// Validate date ranges by timeframe
const validateDates = (start, end, timeframe) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate) || isNaN(endDate)) throw new Error("Invalid date format.");
    if (startDate >= endDate) throw new Error("Start date must be before end date.");

    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    const limits = { '1m': 30, '5m': 90, '15m': 180, '1h': 365, '4h': 730, '1d': 3650 };

    if (diffDays > (limits[timeframe] || 365)) {
        throw new Error(`Selected date range too large for ${timeframe} timeframe.`);
    }
};

// --- Controller Functions ---

// Fetch backtest options
export const getBacktestOptions = async (req, res) => {
    try {
        const userId = req.user.id;
        const strategies = await getStrategiesService(userId);
        const optionsData = await fetchDataOptions();

        return sendResponse(res, {
            symbols: optionsData.symbols || [],
            timeframes: optionsData.timeframes || [],
            strategies,
            takeProfits: [0.5, 1, 2, 5, 10],
            stopLosses: [0.5, 1, 2, 5, 10]
        }, "Backtest options fetched successfully");
    } catch (err) { sendError(res, err, 'getBacktestOptions'); }
};

// Run single backtest
export const runBacktestController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { strategyCode, startDate, endDate, timeframe, takeProfit, stopLoss, ...rest } = req.body;

        if (!strategyCode) return res.status(400).json({ success: false, message: "strategyCode required" });
        validateDates(startDate, endDate, timeframe);

        // FIX: find by strategyCode, not ObjectId
        const dbStrategy = await Strategy.findOne({ code: strategyCode, userId }).lean();
        if (!dbStrategy) return res.status(404).json({ success: false, message: "Strategy not found" });

        const result = await runBacktest({
            userId,
            startDate,
            endDate,
            timeframe,
            strategy: dbStrategy,
            tp: takeProfit,
            sl: stopLoss,
            ...rest
        });

        return sendResponse(res, result, "Backtest executed successfully");

    } catch (err) { sendError(res, err, 'runBacktestController'); }
};

// Run batch backtests
export const runBatchBacktestsController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { configs } = req.body;
        if (!Array.isArray(configs) || configs.length === 0) {
            return res.status(400).json({ success: false, message: "configs array required" });
        }

        const limitedConfigs = configs.slice(0, 50);
        limitedConfigs.forEach(cfg => validateDates(cfg.startDate, cfg.endDate, cfg.timeframe));

        // FIX: ensure each config is mapped to strategyCode
        const batchConfigs = [];
        for (const cfg of limitedConfigs) {
            const strategy = await Strategy.findOne({ code: cfg.strategyCode, userId }).lean();
            if (!strategy) throw new Error(`Strategy ${cfg.strategyCode} not found`);
            batchConfigs.push({ ...cfg, strategy });
        }

        const batchResult = await runBatchBacktests(userId, batchConfigs);
        return sendResponse(res, batchResult, "Batch backtests executed successfully");

    } catch (err) { sendError(res, err, 'runBatchBacktestsController'); }
};

// Preview strategy
export const previewStrategyController = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await runBacktest({ ...req.body, userId, simulateOnly: true });
        return sendResponse(res, result, "Preview executed successfully");
    } catch (err) { sendError(res, err, 'previewStrategyController'); }
};

// Past backtests
export const getUserBacktests = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const backtests = await Backtest.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Backtest.countDocuments({ userId });

        return sendResponse(res, { backtests, page, limit, total });
    } catch (err) { sendError(res, err, 'getUserBacktests'); }
};

// Backtest by ID
export const getBacktestById = async (req, res) => {
    try {
        const backtest = await Backtest.findById(req.params.backtestId).lean();
        if (!backtest) return res.status(404).json({ success: false, message: "Backtest not found" });
        if (backtest.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }
        return sendResponse(res, { backtest });
    } catch (err) { sendError(res, err, 'getBacktestById'); }
};

// Delete backtest
export const deleteBacktest = async (req, res) => {
    try {
        const { backtestId } = req.params;
        const result = await Backtest.deleteOne({ _id: backtestId, userId: req.user.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: "Backtest not found or unauthorized" });
        }
        await logToDb(req.user.id, `Deleted backtest ${backtestId}`);
        return sendResponse(res, {}, "Backtest deleted successfully");
    } catch (err) { sendError(res, err, 'deleteBacktest'); }
};
