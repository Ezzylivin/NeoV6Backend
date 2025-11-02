// File: src/backend/controllers/backtestController.js
// UPDATED: fetchBacktestOptionsController now fetches ML models.
// 🚀 UPGRADE: Fixed all imports and removed inefficient "self-call" for models.

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
// 🚀 FIXED: Import both from the correct service
import { 
    runBacktest, 
    runCombinedStrategyService 
} from "../services/backtestService.js"; 
// 🚀 FIXED: strategyEngineService.js removed
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";
// 🚀 FIXED: Import the model service directly instead of using axios self-call
// (Assuming your function is in mlService.js, update path if needed)
import { getAvailableModels } from "../services/mlService.js"; 
import mongoose from "mongoose";
// axios is no longer needed for fetchBacktestOptionsController
// import axios from "axios"; 

// --- A centralized error handler for controllers ---
const handleControllerError = (res, error, context) => {
    console.error(`Error in ${context}:`, error);
    if (error.message.includes("Not found")) {
        return res.status(404).json({ message: error.message });
    }
    // Return a specific error if possible, otherwise generic 500
    res.status(500).json({ message: `Backtest failed: ${error.message}` });
};

// --- Helper to extract JWT Token ---
const extractAuthToken = (req) => {
    // Note: Express headers are lowercased by default
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return null;
};

// --- Run single strategy backtest ---
export const runBacktestController = async (req, res) => {
    try {
        const userId = req.user._id;
        const config = { ...req.body, userId, simulateOnly: false };
        const authToken = extractAuthToken(req); // Extract the token

        if (!config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: symbol, or timeframe." });
        }

        // PASS authToken to the service
        const result = await runBacktest(config, authToken);
        res.status(201).json(result);
    } catch (err) {
        handleControllerError(res, err, 'runBacktestController');
    }
};

// --- Run combo backtest ---
export const runComboBacktestController = async (req, res) => {
    try {
        const userId = req.user._id;
        const comboPayload = { ...req.body, userId };
        const authToken = extractAuthToken(req); // Extract the token

        if (!comboPayload.strategies || !Array.isArray(comboPayload.strategies) || comboPayload.strategies.length === 0) {
            return res.status(400).json({ message: "The 'strategies' array is required." });
        }
        if (!comboPayload.symbol || !comboPayload.timeframe) {
            return res.status(400).json({ message: "Missing required fields: symbol or timeframe." });
        }

        // PASS authToken to the service
        // 🚀 FIXED: This now correctly calls the function from backtestService.js
        const result = await runCombinedStrategyService(userId, comboPayload, authToken);
        res.status(200).json(result);
    } catch (error) {
        handleControllerError(res, error, 'runComboBacktestController');
    }
};

// --- Preview a strategy ---
export const previewStrategyController = async (req, res) => {
    try {
        const userId = req.user._id;
        const config = { ...req.body, userId, simulateOnly: true };
        const authToken = extractAuthToken(req); // Extract the token

        if (!config.code || !config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: code, symbol, or timeframe." });
        }

        // PASS authToken to the service
        const result = await runBacktest(config, authToken);
        res.status(200).json(result);
    } catch (err) {
        handleControllerError(res, err, 'previewStrategyController');
    }
};

// --- Other Controllers (CRUD, Options) ---

// --- UPDATED: fetchBacktestOptionsController ---
export const fetchBacktestOptionsController = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log(`[OPTIONS CONTROLLER] Attempting to fetch options for userId: ${userId}`);

        // Fetch strategies, symbols, params, and ML models in parallel
        const [strategies, exchangeSymbols, exchangeParams, availableModels] = await Promise.all([
            Strategy.find({ userId }).select("name code params").lean(),
            fetchAllExchangeSymbols(),
            fetchAllExchangeParams(),
            // 🚀 FIXED: Directly call the service function, no inefficient self-call
            getAvailableModels()
                .catch(err => {
                    // Log the error but don't crash the whole options fetch
                    console.error("[OPTIONS CONTROLLER] Failed to fetch ML models:", err.message);
                    return []; // Return an empty array if fetching models fails
                })
            // --- END Fetch ML models ---
        ]);

        console.log(`[OPTIONS CONTROLLER] DB strategies: ${strategies.length}, Exchange Symbols: ${exchangeSymbols.length}, Models: ${availableModels.length}`);

        // Combine symbols and timeframes from exchanges and strategies
        const symbolSet = new Set(exchangeSymbols);
        const timeframeSet = new Set(exchangeParams.timeframes);
        strategies.forEach(s => {
            if (s.params?.symbol) symbolSet.add(s.params.symbol);
            if (s.params?.timeframe) timeframeSet.add(s.params.timeframe);
        });

        // Prepare the response data including the fetched models
        const responseData = {
            strategies,
            symbols: Array.from(symbolSet).sort(),
            timeframes: Array.from(timeframeSet),
            models: availableModels // Include the fetched models here
        };

        console.log('[OPTIONS CONTROLLER] Sending successful response to frontend.');
        res.json(responseData);
    } catch (err) {
        // Handle errors from Strategy.find, fetchAllExchangeSymbols, etc.
        handleControllerError(res, err, 'fetchBacktestOptionsController');
    }
};
// --- END UPDATED ---


export const fetchPastBacktestsController = async (req, res) => {
    try {
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
