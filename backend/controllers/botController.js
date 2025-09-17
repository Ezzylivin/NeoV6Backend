// File: backend/controllers/botController.js
import * as botService from "../services/botService.js";

// Helper for consistent responses
const sendResponse = (res, data, message = 'Success', status = 200) => {
    res.status(status).json({ success: status < 400, message, data });
};

export const startBotController = async (req, res) => {
  try {
    const userId = req.user.id; // SECURE: Get user ID from the token
    const { symbol, timeframes, initialBalance, strategy, risk } = req.body;
    
    if (!symbol || initialBalance == null) {
      return sendResponse(res, null, "Missing required fields: symbol, initialBalance", 400);
    }

    const bot = await botService.startTradingBot(userId, { symbol, timeframes, initialBalance, strategy, risk });
    sendResponse(res, { bot }, "Bot started successfully");
  } catch (err) {
    console.error("[Start Bot Error]", err);
    sendResponse(res, { error: err.message }, err.message, 500);
  }
};

export const stopBotController = async (req, res) => {
  try {
    const userId = req.user.id; // SECURE: Get user ID from the token
    const bot = await botService.stopTradingBot(userId);
    sendResponse(res, { bot }, "Bot stopped successfully");
  } catch (err) {
    console.error("[Stop Bot Error]", err);
    sendResponse(res, { error: err.message }, err.message, 500);
  }
};

export const getBotStatusController = async (req, res) => {
  try {
    const userId = req.user.id; // SECURE: Get user ID from the token
    const status = await botService.getBotStatus(userId);
    sendResponse(res, { status });
  } catch (err) {
    console.error("[Bot Status Error]", err);
    sendResponse(res, { error: err.message }, err.message, 500);
  }
};

export const getHistoryController = async (req, res) => {
  try {
    const userId = req.user.id; // SECURE: Get user ID from the token
    const limit = parseInt(req.query.limit) || 1000;
    const history = await botService.getBotHistory(userId, limit);
    sendResponse(res, { history });
  } catch (err) {
    console.error("[Bot History Error]", err);
    sendResponse(res, { error: err.message }, err.message, 500);
  }
};
// --- EXPORTS ---
export {
  startBotController as startBot,
  stopBotController as stopBot,
  getBotStatusController as getBotStatus,
  getHistoryController as getBotHistory
};
