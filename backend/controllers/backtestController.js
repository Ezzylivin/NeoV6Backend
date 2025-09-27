import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { runBacktest } from "../services/backtestService.js"; // Assuming this is the new single backtest engine
import { runCombinedStrategyService } from "../services/strategyEngineService.js"; // The combo engine
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";
import { normalizeSymbol } from "../services/backtestDataService.js";
import mongoose from "mongoose";

// --- A centralized error handler for controllers ---
const handleControllerError = (res, error, context) => {
    console.error(`Error in ${context}:`, error);
    // Check for specific error types if needed
    if (error.message.includes("Not found")) {
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: `An unexpected error occurred in ${context}.` });
};

// --- Run single strategy backtest ---
export const runBacktestController = async (req, res) => {
    try {
        const { userId } = req.user;
        const config = { ...req.body, userId, simulateOnly: false }; // Combine user ID and payload

        // Basic Validation
        if (!config.code || !config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: code, symbol, or timeframe." });
        }

        // Pass the entire config object to the robust backtest service
        const result = await runBacktest(config);

        res.status(201).json(result); // Use 201 Created since a new backtest resource is made
    } catch (err) {
        handleControllerError(res, err, 'runBacktestController');
    }
};

// --- Run combo backtest ---
export const runComboBacktest = async (req, res) => {
    try {
        const { userId } = req.user;
        const comboPayload = { ...req.body, userId };

        // Basic Validation
        if (!comboPayload.strategies || !Array.isArray(comboPayload.strategies) || comboPayload.strategies.length === 0) {
            return res.status(400).json({ message: "The 'strategies' array is required." });
        }
        if (!comboPayload.symbol || !comboPayload.timeframe) {
            return res.status(400).json({ message: "Missing required fields: symbol or timeframe." });
        }

        // Pass the entire payload to the combined strategy service
        const result = await runCombinedStrategyService(userId, comboPayload);

        res.status(200).json(result);
    } catch (error) {
        handleControllerError(res, error, 'runComboBacktestController');
    }
};

// --- Preview a strategy ---
export const previewStrategyController = async (req, res) => {
    try {
        const { userId } = req.user;
        const config = { ...req.body, userId, simulateOnly: true }; // Preview is always a simulation

        if (!config.code || !config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: code, symbol, or timeframe." });
        }

        // Use the same powerful backtest engine for previews
        const result = await runBacktest(config);

        res.status(200).json(result);
    } catch (err) {
        handleControllerError(res, err, 'previewStrategyController');
    }
};


// --- Other Controllers (CRUD, Options) ---

export const fetchBacktestOptionsController = async (req, res) => {
    try {
        const { userId } = req.user;
        const strategies = await Strategy.find({ userId }).select("name code params").lean();
        const [exchangeSymbols, exchangeParams] = await Promise.all([
            fetchAllExchangeSymbols(),
            fetchAllExchangeParams()
        ]);

        // Aggregate unique symbols and timeframes
        const symbolSet = new Set(exchangeSymbols);
        const timeframeSet = new Set(exchangeParams.timeframes);
        strategies.forEach(s => {
            if (s.params?.symbol) symbolSet.add(s.params.symbol);
            if (s.params?.timeframe) timeframeSet.add(s.params.timeframe);
        });

        res.json({
            strategies,
            symbols: Array.from(symbolSet).sort(),
            timeframes: Array.from(timeframeSet)
        });
    } catch (err) {
        handleControllerError(res, err, 'fetchBacktestOptionsController');
    }
};

export const fetchPastBacktestsController = async (req, res) => {
    try {
        const { userId } = req.user;
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

export const getBacktestById = async (req, res) => {
    try {
        const { backtestId } = req.params;
        const { userId } = req.user;

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
        const { userId } = req.user;

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
