import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
// 🚀 FIXED: Import both from the correct service
import { 
    runBacktest, 
    runCombinedStrategyService 
} from "../services/backtestService.js"; 
import { fetchAllExchangeSymbols, fetchAllExchangeParams } from "../services/priceService.js";
// 🚀 FIXED: Import the model service directly
import { getAvailableModels } from "../services/mlService.js"; 
import mongoose from "mongoose";

// --- A centralized error handler for controllers ---
const handleControllerError = (res, error, context) => {
    console.error(`Error in ${context}:`, error);
    if (error.message && error.message.includes("Not found")) {
        return res.status(404).json({ message: error.message });
    }
    // Return a specific error if possible, otherwise generic 500
    res.status(500).json({ message: `Backtest failed: ${error.message}` });
};

// --- Helper to extract JWT Token ---
const extractAuthToken = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return null;
};

// --- 1. Run single strategy backtest ---
export const runBacktestController = async (req, res) => {
    try {
        const userId = req.user._id;
        // 🚀 Ensure we aren't trying to force a stream if it's a standard run
        const config = { ...req.body, userId, simulateOnly: false };

        if (!config.symbol || !config.timeframe) {
            return res.status(400).json({ message: "Missing required fields: symbol or timeframe." });
        }

        console.log("[Atomic Controller] Executing Standard JSON Run...");

        // 1. Call Service 
        // Ensure your runBacktest service returns the 'data' from the axios call
        const result = await runBacktest(config); 

        // 2. 🚀 THE FIX: Use res.json() instead of .pipe()
        // We don't need Event-Stream headers for Atomic runs.
        return res.status(200).json(result);

    } catch (err) {
        console.error("🔥 Controller Atomic Error:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ message: "Backtest engine failed", error: err.message });
        }
    }
};

/**
 * 🚀 UPGRADE: Supports Hybrid (Combo) Streaming
 */
export const runComboBacktestController = async (req, res) => {
    try {
        const userId = req.user._id;
        const comboPayload = { ...req.body, userId };

        if (!comboPayload.strategies || !Array.isArray(comboPayload.strategies) || comboPayload.strategies.length === 0) {
            return res.status(400).json({ message: "The 'strategies' array is required." });
        }
        if (!comboPayload.symbol || !comboPayload.timeframe) {
            return res.status(400).json({ message: "Missing required fields: symbol or timeframe." });
        }

        // 1. Set Stream Headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); 

        console.log("[Combo Controller] Opening Stream Pipe to Python...");

        // 2. Call Service (Must use responseType: 'stream')
        const pythonStream = await runCombinedStrategyService(userId, comboPayload);

        // 3. Pipe Python -> React
        pythonStream.pipe(res);

        pythonStream.on('error', (err) => {
            console.error("❌ Combo Stream Pipe Error:", err.message);
            if (!res.headersSent) res.status(500).end();
        });

    } catch (error) {
        console.error("🔥 Controller Combo Error:", error.message);
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
};

// --- 3. Preview a strategy ---
export const previewStrategyController = async (req, res) => {
    try {
        const userId = req.user._id;
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

// --- 4. Fetch Backtest Options (Symbols, Models, etc.) ---
export const fetchBacktestOptionsController = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log(`[OPTIONS CONTROLLER] Fetching options for userId: ${userId}`);

        // Fetch strategies, symbols, params, and ML models in parallel
        const [strategies, exchangeSymbols, exchangeParams, availableModels] = await Promise.all([
            Strategy.find({ userId }).select("name code params").lean(),
            fetchAllExchangeSymbols(),
            fetchAllExchangeParams(),
            // 🚀 FIXED: Call service directly to get dynamic models
            getAvailableModels().catch(err => {
                console.error("[OPTIONS] Failed to fetch ML models:", err.message);
                return []; 
            })
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
            timeframes: Array.from(timeframeSet),
            models: availableModels // 🟢 Needed for frontend dropdown
        };

        res.json(responseData);
    } catch (err) {
        handleControllerError(res, err, 'fetchBacktestOptionsController');
    }
};

// --- 5. Get Backtest Status (For Polling) ---
// 🟢 NEW: Handles the smart progress bar logic
export const getBacktestStatusController = async (req, res) => {
    try {
        const { jobId } = req.query;
        const userId = req.user._id;

        if (!jobId) return res.status(400).json({ message: "Missing jobId parameter." });

        const backtest = await Backtest.findOne({ _id: jobId, userId }).select("status stage progress").lean();
        
        if (!backtest) return res.status(404).json({ message: "Job not found." });

        // Return specific 'stage' string for the frontend switch statement
        res.json({
            status: backtest.status,
            stage: backtest.stage || (backtest.status === 'COMPLETED' ? 'completed' : 'processing'),
            progress: backtest.progress || 0
        });
    } catch (err) {
        handleControllerError(res, err, 'getBacktestStatusController');
    }
};

// --- 6. Fetch Past Backtests ---
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

// --- 7. Get Full Backtest Result ---
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

// --- 8. Delete Backtest ---
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
