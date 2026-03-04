// File: backend/controllers/botController.js
// 🚀 UPGRADE: v10.2 - Service Delegation (Fixes Payload Structure Errors)
import * as botService from "../services/botService.js";

// Helper for consistent API responses
const sendResponse = (res, data, status = 200) => {
    res.status(status).json(data);
};

// --- Start the trading bot ---
export const startBotController = async (req, res) => {
    try {
        // 1. Robust User Extraction
        const userId = req.body.userId || req.user?._id;
        if (!userId) {
            return sendResponse(res, { message: "User Identity missing." }, 401);
        }

        console.log(`👤 Controller StartBot for User: ${userId}`);

        // 2. Pass EVERYTHING to Service
        // The service now handles "Smart Unwrapping" (Flat vs Wrapped configs)
        // and performs the validation there.
        const bot = await botService.startTradingBot(userId, req.body);
        
        sendResponse(res, bot, 201);

    } catch (err) {
        console.error("❌ Controller Error:", err.message);
        // Send back the received body so you can debug in Chrome Network Tab if needed
        res.status(400).json({ 
            message: err.message || "Failed to start bot.",
            debugPayload: req.body 
        });
    }
};

// --- Stop the trading bot ---
export const stopBotController = async (req, res) => {
    try {
        const userId = req.body.userId || req.query.userId || req.user?._id;
        if (!userId) return sendResponse(res, { message: "User Identity missing." }, 401);

        const bot = await botService.stopTradingBot(userId);
        sendResponse(res, bot);
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to stop bot." });
    }
};

// --- Reset Bot (Wipe History) ---
export const resetBotController = async (req, res) => {
    try {
        const userId = req.body.userId || req.query.userId || req.user?._id;
        if (!userId) return sendResponse(res, { message: "User Identity missing." }, 401);

        // Forward to Service (Clean Architecture)
        // We pass req.body to allow any specific reset configs if needed in future
        const result = await botService.resetBotController(userId, req.body);
        
        sendResponse(res, result);
    } catch (err) {
        res.status(500).json({ message: err.message || "Failed to reset bot." });
    }
};

// --- Get the bot's current status ---
export const getBotStatusController = async (req, res) => {
    try {
        const userId = req.query.userId || req.user?._id;
        if (!userId) return sendResponse(res, { message: "User Identity missing." }, 401);

        const status = await botService.getBotStatus(userId);

        // Crash Proof: Return safe default if null
        if (!status) {
            return sendResponse(res, { 
                status: 'stopped', 
                isConfigured: false,
                logs: [],
                activePositions: [],
                performance: { pnl: 0, winRate: 0 }
            });
        }

        sendResponse(res, status);
    } catch (err) {
        console.error("[getBotStatus] Error:", err.message);
        return sendResponse(res, { 
            status: 'stopped', 
            error: "Failed to fetch remote status",
            logs: []
        });
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
        res.status(500).json({ message: "Failed to fetch logs." });
    }
};

export const closePositionController = async (req, res) => {
    try {
        const userId = req.body.userId || req.user?._id;
        const symbol = req.body.symbol;

        if (!userId) return sendResponse(res, { message: "User Identity missing." }, 401);
        if (!symbol) return sendResponse(res, { message: "Asset Symbol missing." }, 400);

        console.log(`🎯 Controller Manual Exit: User ${userId} Closing ${symbol}`);

        // Forward to Service
        const result = await botService.closeActivePosition(userId, symbol);
        
        sendResponse(res, result);
    } catch (err) {
        console.error("❌ Manual Exit Error:", err.message);
        res.status(500).json({ message: err.message || "Failed to close position." });
    }
};

// --- Get Certified Winners ---
export const getBotWinnersController = async (req, res) => {
    try {
        const winners = await botService.getWinnersList();
        res.status(200).json(winners);
    } catch (err) {
        console.error("[Controller] Error fetching winners:", err.message);
        res.status(500).json({ message: "Failed to fetch winners list." });
    }
};
