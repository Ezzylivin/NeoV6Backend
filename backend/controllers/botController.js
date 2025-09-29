// File: backend/controllers/botController.js
// UPGRADED: Hardened the getBotStatusController to be crash-proof and handle cases where no bot exists.

import * as botService from "../services/botService.js";

// Helper for consistent API responses
const sendResponse = (res, data, status = 200) => {
    res.status(status).json(data);
};

// Helper for consistent error handling
const handleControllerError = (res, err, context) => {
    console.error(`[${context} Error]`, err);
    res.status(500).json({ message: err.message || `Failed in ${context}.` });
};


// --- Start the trading bot ---
export const startBotController = async (req, res) => {
    try {
        const userId = req.user._id;
        // The payload from the frontend is now clean and can be passed directly
        const config = req.body;
        
        // Basic validation for core components
        if (!config.symbol || !config.timeframe || !config.capitalAllocation) {
            return sendResponse(res, { message: "Missing required fields: symbol, timeframe, or capitalAllocation." }, 400);
        }

        const bot = await botService.startTradingBot(userId, config);
        sendResponse(res, bot, 201); // 201 Created
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

        // ✅ UPGRADE: Add an explicit check for a null/undefined response.
        // This makes the controller crash-proof.
        if (!status) {
            // If no bot is found, it's not an error. Send a clear, default "stopped" status.
            return sendResponse(res, { status: 'stopped', isConfigured: false });
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
