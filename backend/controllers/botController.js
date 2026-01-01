// File: backend/controllers/botController.js
// 🚀 UPGRADE: v67.3 - "Reset Ready"
// Changes: Added resetBotController to wipe bot history via Python service.

import * as botService from "../services/botService.js";
import axios from "axios"; 

// Helper for consistent API responses
const sendResponse = (res, data, status = 200) => {
    res.status(status).json(data);
};

// Helper for consistent error handling
const handleControllerError = (res, err, context) => {
    console.error(`[${context} Error]`, err);
    // Return the specific error message from the service/Python if available
    res.status(500).json({ message: err.message || `Failed in ${context}.` });
};

// --- Start the trading bot ---
export const startBotController = async (req, res) => {
    try {
        // 🚀 CRITICAL UPGRADE: Prefer Wallet Address from body, fallback to req.user
        const userId = req.body.userId || req.user?._id; 
        
        if (!userId) {
            return sendResponse(res, { message: "User Identity (Wallet or Login) missing." }, 401);
        }

        const config = req.body;
        
        // 1. Basic Validation
        if (!config.symbol || !config.timeframe || !config.capitalAllocation) {
            return sendResponse(res, { message: "Missing required fields: symbol, timeframe, or capitalAllocation." }, 400);
        }

        // 2. Strategy Validation (Prevent starting a bot with no logic)
        const hasSingle = !!config.strategyId;
        const hasCombo = config.comboConfig && config.comboConfig.strategyCodes && config.comboConfig.strategyCodes.length > 0;
        const hasParams = config.params && Object.keys(config.params).length > 0; // Check for ML params

        if (!hasSingle && !hasCombo && !hasParams) {
            return sendResponse(res, { message: "You must select a Strategy or a Combo Setup to start the bot." }, 400);
        }

        // 3. Launch via Service (which talks to Python)
        const bot = await botService.startTradingBot(userId, config);
        sendResponse(res, bot, 201); 

    } catch (err) {
        handleControllerError(res, err, 'startBotController');
    }
};

// --- Stop the trading bot ---
export const stopBotController = async (req, res) => {
    try {
        // 🚀 UPGRADE: Check body/query for userId first
        const userId = req.body.userId || req.query.userId || req.user?._id;
        
        if (!userId) return sendResponse(res, { message: "User Identity missing." }, 401);

        const bot = await botService.stopTradingBot(userId);
        sendResponse(res, bot);
    } catch (err) {
        handleControllerError(res, err, 'stopBotController');
    }
};

// --- 🆕 RESET BOT (Wipe History) ---
export const resetBotController = async (req, res) => {
    try {
        // Forward the reset request directly to the Python Service
        const pythonUrl = process.env.ML_SERVER_URL || "http://127.0.0.1:8000";
        
        // Pass the entire body (userId, botId, capitalAllocation)
        const response = await axios.post(`${pythonUrl}/api/bot/reset`, req.body);
        
        sendResponse(res, response.data);
    } catch (err) {
        // Handle specific Python errors gracefully
        if (err.response) {
            return res.status(err.response.status).json(err.response.data);
        }
        handleControllerError(res, err, 'resetBotController');
    }
};

// --- Get the bot's current status ---
export const getBotStatusController = async (req, res) => {
    try {
        const userId = req.query.userId || req.user?._id;

        if (!userId) return sendResponse(res, { message: "User Identity missing." }, 401);

        const status = await botService.getBotStatus(userId);

        // ✅ CRASH PROOF: Handle case where no bot exists yet
        if (!status) {
            return sendResponse(res, { 
                status: 'stopped', 
                isConfigured: false,
                logs: [] 
            });
        }

        sendResponse(res, status);
    } catch (err) {
        handleControllerError(res, err, 'getBotStatusController');
    }
};

// --- Get the bot's activity logs ---
export const getBotLogsController = async (req, res) => {
    try {
        const userId = req.query.userId || req.user?._id;
        
        if (!userId) return sendResponse(res, { message: "User Identity missing." }, 401);

        const limit = parseInt(req.query.limit) || 100;
        const logs = await botService.getBotLogs(userId, limit);
        sendResponse(res, logs);
    } catch (err) {
        handleControllerError(res, err, 'getBotLogsController');
    }
};

// --- Get Certified Winners from Python ---
export const getBotWinnersController = async (req, res) => {
    try {
        // 🟢 FIX: Use the Service (which now correctly calls Python)
        const winners = await botService.getWinnersList();
        res.status(200).json(winners);
    } catch (err) {
        console.error("[Controller] Error fetching winners:", err.message);
        res.status(500).json({ message: "Failed to fetch winners list." });
    }
};
