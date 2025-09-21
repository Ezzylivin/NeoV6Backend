// File: backend/controllers/botController.js
// UPGRADED: The startBotController is now "bilingual" and can launch both single and combo strategies.

import * as botService from "../services/botService.js";

// Helper for consistent API responses
const sendResponse = (res, data, status = 200) => {
    res.status(status).json(data);
};

// --- ✅ UPGRADED: Start the trading bot (handles both single and combo) ---
export const startBotController = async (req, res) => {
  try {
    const userId = req.user._id;
    const { strategyId, symbol, timeframe, capitalAllocation, comboConfig } = req.body;
    
    let config;

    // Determine if this is a combo backtest or a single one
    if (comboConfig && comboConfig.strategyCodes && comboConfig.strategyCodes.length > 0) {
        // --- This is a COMBO strategy bot ---
        if (!symbol || !timeframe || !capitalAllocation || !comboConfig.combinationRule) {
            return sendResponse(res, { message: "Missing required fields for combo bot." }, 400);
        }
        config = {
            isCombo: true,
            comboConfig,
            symbol,
            timeframe,
            capitalAllocation,
        };
    } else {
        // --- This is a SINGLE strategy bot ---
        if (!strategyId || !symbol || !timeframe || !capitalAllocation) {
            return sendResponse(res, { message: "Missing required fields for single bot." }, 400);
        }
        config = {
            isCombo: false,
            strategyId,
            symbol,
            timeframe,
            capitalAllocation,
        };
    }

    const bot = await botService.startTradingBot(userId, config);
    sendResponse(res, bot);
  } catch (err) {
    console.error("[Start Bot Error]", err);
    sendResponse(res, { message: err.message || "Failed to start bot." }, 500);
  }
};

// --- Stop the trading bot (no changes) ---
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

// --- Get the bot's current status (no changes) ---
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

// --- Get the bot's activity logs (no changes) ---
export const getBotLogsController = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 100;
    const logs = await botService.getBotLogs(userId, limit);
    sendResponse(res, logs);
  } catch (err) {
    console.error("[Bot Logs Error]", err);
    sendResponse(res, { message: err.message || "Failed to get bot logs." }, 500);
  }
};

