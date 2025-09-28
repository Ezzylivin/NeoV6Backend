import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runBacktest } from "../services/backtestService.js";
import { runCombinedStrategyService } from "../services/strategyEngineService.js";
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";
import mongoose from "mongoose";

// --- A centralized error handler for controllers ---
const handleControllerError = (res, error, context) => {
    console.error(`Error in ${context}:`, error);
    if (error.message.includes("Not found")) {
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: `An unexpected error occurred in ${context}.` });
};

// --- Run single strategy backtest ---
export const runBacktestController = async (req, res) => {
    try {
        // ✅ FIX: Get the user ID from the `_id` property
        const userId = req.user._id;
        const config = { ...req.body, userId, simulateOnly: false };

        if (!config.code || !config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: code, symbol, or timeframe." });
        }
        
        const result = await runBacktest(config);
        res.status(201).json(result);
    } catch (err) {
        handleControllerError(res, err, 'runBacktestController');
    }
};

// --- Run combo backtest ---
export const runComboBacktestController = async (req, res) => {
    try {
        // ✅ FIX: Get the user ID from the `_id` property
        const userId = req.user._id;
        const comboPayload = { ...req.body, userId };

        if (!comboPayload.strategies || !Array.isArray(comboPayload.strategies) || comboPayload.strategies.length === 0) {
            return res.status(400).json({ message: "The 'strategies' array is required." });
        }
        if (!comboPayload.symbol || !comboPayload.timeframe) {
            return res.status(400).json({ message: "Missing required fields: symbol or timeframe." });
        }

        const result = await runCombinedStrategyService(userId, comboPayload);
        res.status(200).json(result);
    } catch (error) {
        handleControllerError(res, error, 'runComboBacktestController');
    }
};

// --- Preview a strategy ---
export const previewStrategyController = async (req, res) => {
    try {
        // ✅ FIX: Get the user ID from the `_id` property
        const userId = req.user._id;
        const config = { ...req.body, userId, simulateOnly: true };

        if (!config.code || !config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: code, symbol, or timeframe." });
        }
        
        const result = await runBacktest(config);
        res.status(200).json(result);
    } catch (err) {
        handleControllerError(res, err, 'previewStrategyController');
    }
};

// --- Other Controllers (CRUD, Options) ---
export const fetchBacktestOptionsController = async (req, res) => {
    try {
        // ✅ FIX: Get the user ID from the `_id` property
        const userId = req.user._id;
        console.log(`[OPTIONS CONTROLLER] Attempting to fetch strategies for userId: ${userId}`);

        const strategies = await Strategy.find({ userId }).select("name code params").lean();
        console.log(`[OPTIONS CONTROLLER] Database query found ${strategies.length} strategies.`);

        const [exchangeSymbols, exchangeParams] = await Promise.all([
            fetchAllExchangeSymbols(),
            fetchAllExchangeParams()
        ]);

        const symbolSet = new Set(exchangeSymbols);
        const timeframeSet = new Set(exchangeParams.timeframes);
        strategies.forEach(s => {
            if (s.params?.symbol) symbolSet.add(s.params.symbol);
            if (s.params?.timeframe) timeframeSet.add(s.params.timeframe);
        });
        
        const responseData = {
            strategies,
            symbols: Array.from(symbolSet).sort(),
            timeframes: Array.from(timeframeSet)
        };

        console.log('[OPTIONS CONTROLLER] Sending successful response to frontend.');
        res.json(responseData);
    } catch (err) {
        handleControllerError(res, err, 'fetchBacktestOptionsController');
    }
};

export const fetchPastBacktestsController = async (req, res) => {
    try {
        // ✅ FIX: Get the user ID from the `_id` property
        const userId = req.user._id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const [backtests, total] = await Promise.all([
            Backtest.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Backtest.countDocuments({ userId }),
        ]);
        res.json({ backtests, total, page, limit });
    } catch (err) {
        handleControllerError(res, err, 'fetchPastBacktestsController');
    }
};

export const getBacktestByIdController = async (req, res) => {
    try {
        const { backtestId } = req.params;
        // ✅ FIX: Get the user ID from the `_id` property
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(backtestId)) {
            return res.status(400).json({ message: "Invalid backtest ID format." });
        }

        const backtest = await Backtest.findOne({ _id: backtestId, userId }).lean();
        if (!backtest) {
            return res.status(404).json({ message: "Backtest not found." });
        }
        res.json(backtest);
    } catch (err) {
        handleControllerError(res, err, 'getBacktestByIdController');
    }
};

export const deleteBacktestController = async (req, res) => {
    try {
        const { backtestId } = req.params;
        // ✅ FIX: Get the user ID from the `_id` property
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(backtestId)) {
            return res.status(400).json({ message: "Invalid backtest ID format." });
        }

        const deleted = await Backtest.findOneAndDelete({ _id: backtestId, userId });
        if (!deleted) {
            return res.status(404).json({ message: "Backtest not found." });
        }
        res.status(200).json({ success: true, message: "Backtest deleted successfully." });
    } catch (err) {
        handleControllerError(res, err, 'deleteBacktestController');
    }
};
