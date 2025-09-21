// File: backend/controllers/botController.js
// UPGRADED: This controller is now fully synchronized with the upgraded botService and schema.

import * as botService from "../services/botService.js";

// Helper for consistent API responses
const sendResponse = (res, data, status = 200) => {
    res.status(status).json(data);
};

// --- Start the trading bot ---
export const startBotController = async (req, res) => {
  try {
    const userId = req.user._id; // Get user ID from the 'protect' middleware
    const { strategyId, symbol, timeframe, capitalAllocation } = req.body;
    
    // Validate that all required fields are present
    if (!strategyId || !symbol || !timeframe || !capitalAllocation) {
      return sendResponse(res, { message: "Missing required fields: strategyId, symbol, timeframe, capitalAllocation" }, 400);
    }

    const bot = await botService.startTradingBot(userId, { strategyId, symbol, timeframe, capitalAllocation });
    sendResponse(res, bot);
  } catch (err) {
    console.error("[Start Bot Error]", err);
    sendResponse(res, { message: err.message || "Failed to start bot." }, 500);
  }
};

// --- Stop the trading bot ---
export const stopBotController = async (req, res) => {
  try {
    const userId = req.user._id;
    const bot = await botService.stopTradingBot(userId);
    sendResponse(res, bot);
  } catch (err) {
    console.error("[Stop Bot Error]", err);
    sendResponse(res, { message: err.message || "Failed to stop bot." }, 500);
  }
};

// --- Get the bot's current status ---
export const getBotStatusController = async (req, res) => {
  try {
    const userId = req.user._id;
    const status = await botService.getBotStatus(userId);
    sendResponse(res, status);
  } catch (err) {
    console.error("[Bot Status Error]", err);
    sendResponse(res, { message: err.message || "Failed to get bot status." }, 500);
  }
};

// --- Get the bot's activity logs ---
export const getBotLogsController = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 100; // Allow client to specify log limit
    const logs = await botService.getBotLogs(userId, limit);
    sendResponse(res, logs);
  } catch (err) {
    console.error("[Bot Logs Error]", err);
    sendResponse(res, { message: err.message || "Failed to get bot logs." }, 500);
  }
};
