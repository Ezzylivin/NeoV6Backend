// File: src/backend/controllers/botController.js
import * as botService from "../services/botService.js";

/**
 * POST /api/bots/start
 * body: { userId, symbol, timeframes, initialBalance, strategy, risk }
 */
export const startBotController = async (req, res) => {
  try {
    const { userId, symbol, timeframes, initialBalance, strategy, risk } = req.body;
    if (!userId || !symbol || initialBalance == null) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    const bot = await botService.startTradingBot(userId, { symbol, timeframes, initialBalance, strategy, risk });
    res.json({ success: true, bot });
  } catch (err) {
    console.error("[Start Bot Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/bots/stop
 * body: { userId }
 */
export const stopBotController = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });
    const bot = await botService.stopTradingBot(userId);
    res.json({ success: true, bot });
  } catch (err) {
    console.error("[Stop Bot Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/bots/status/:userId
 */
export const getBotStatusController = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });
    const status = await botService.getBotStatus(userId);
    res.json({ success: true, status });
  } catch (err) {
    console.error("[Bot Status Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/bots/history/:userId
 */
export const getHistoryController = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });
    const history = await botService.getBotHistory(userId);
    res.json({ success: true, history });
  } catch (err) {
    console.error("[Bot History Error]", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
