// File: backend/controllers/botController.js
// 🚀 UPGRADE: Fully integrated with Python Bot Service. 
// Includes validation guards and crash-proof status checks.

import * as botService from "../services/botService.js";

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
        const userId = req.user._id;
        const config = req.body;
        
        // 1. Basic Validation
        if (!config.symbol || !config.timeframe || !config.capitalAllocation) {
            return sendResponse(res, { message: "Missing required fields: symbol, timeframe, or capitalAllocation." }, 400);
        }

        // 2. Strategy Validation (Prevent starting a bot with no logic)
        const hasSingle = !!config.strategyId;
        const hasCombo = config.comboConfig && config.comboConfig.strategyCodes && config.comboConfig.strategyCodes.length > 0;

        if (!hasSingle && !hasCombo) {
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
        const userId = req.user._id;
        const bot = await botService.stopTradingBot(userId);
        sendResponse(res, bot);
    } catch (err) {
        handleControllerError(res, err, 'stopBotController');
    }
};

// --- Get the bot's current status ---
export const getBotStatusController = async (req, res) => {
    try {
        const userId = req.user._id;
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
        const userId = req.user._id;
        const limit = parseInt(req.query.limit) || 100;
        const logs = await botService.getBotLogs(userId, limit);
        sendResponse(res, logs);
    } catch (err) {
        handleControllerError(res, err, 'getBotLogsController');
    }
};
