// File: src/backend/controllers/backtestController.js

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { 
    runBacktest, 
    runCombinedStrategyService 
} from "../services/backtestService.js"; 
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";
import { getAvailableModels } from "../services/mlService.js"; 
import mongoose from "mongoose";

// --- A centralized error handler for controllers ---
const handleControllerError = (res, error, context) => {
    console.error(`Error in ${context}:`, error);
    // Check for specific status codes thrown by services
    if (error.message && error.message.includes("Not found")) {
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
        // 1. Prepare config
        // We set simulateOnly to false because we WANT to save this run
        const config = { ...req.body, userId, simulateOnly: false };
        const authToken = extractAuthToken(req); 

        if (!config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: symbol, or timeframe." });
        }

        console.log("[Controller] Forwarding single backtest request to Service...");
        
        // 2. Call Service
        // The service will: Call Python -> Get Results -> Save to DB -> Return Full Result
        const result = await runBacktest(config, authToken); 
        
        // 3. Return result to Frontend
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
        const authToken = extractAuthToken(req); 

        if (!comboPayload.strategies || !Array.isArray(comboPayload.strategies) || comboPayload.strategies.length === 0) {
            return res.status(400).json({ message: "The 'strategies' array is required." });
        }
        if (!comboPayload.symbol || !comboPayload.timeframe) {
            return res.status(400).json({ message: "Missing required fields: symbol or timeframe." });
        }

        console.log("[Controller] Forwarding combo backtest request to Service...");

        // Call Service
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
        // simulateOnly: true means DO NOT SAVE to database
        const config = { ...req.body, userId, simulateOnly: true };
        const authToken = extractAuthToken(req); 

        if (!config.code || !config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: code, symbol, or timeframe." });
        }

        const result = await runBacktest(config, authToken);
        res.status(200).json(result);
    } catch (err) {
        handleControllerError(res, err, 'previewStrategyController');
    }
};

// --- Other Controllers (CRUD, Options) ---

export const fetchBacktestOptionsController = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log(`[OPTIONS CONTROLLER] Fetching options for userId: ${userId}`);

        // Fetch strategies, symbols, params, and ML models in parallel
        const [strategies, exchangeSymbols, exchangeParams, availableModels] = await Promise.all([
            Strategy.find({ userId }).select("name code params").lean(),
            fetchAllExchangeSymbols(),
            fetchAllExchangeParams(),
            getAvailableModels().catch(err => {
                console.error("[OPTIONS CONTROLLER] Failed to fetch ML models:", err.message);
                return []; 
            })
        ]);

        // Combine symbols and timeframes
        const symbolSet = new Set(exchangeSymbols);
        const timeframeSet = new Set(exchangeParams.timeframes);
        strategies.forEach(s => {
            if (s.params?.symbol) symbolSet.add(s.params.symbol);
            if (s.params?.timeframe) timeframeSet.add(s.params.timeframe);
        });

        const responseData = {
            strategies,
            symbols: Array.from(symbolSet).sort(),
            timeframes: Array.from(timeframeSet),
            models: availableModels 
        };

        res.json(responseData);
    } catch (err) {
        handleControllerError(res, err, 'fetchBacktestOptionsController');
    }
};


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
