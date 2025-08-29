// File: backend/controllers/botController.js

import {
  startTradingBot,
  stopTradingBot,
  getBotStatus
} from '../services/botService.js';

/**
 * Start bot controller
 * Accepts: userId (from auth or body), symbol, amount, timeframes, strategy, risk
 */
export const startBotController = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { symbol, amount, timeframes, strategy, risk } = req.body;

    if (!userId || !symbol || !amount) {
      return res.status(400).json({
        success: false,
        error: 'userId, symbol, and amount are required.'
      });
    }

    await startTradingBot(userId, symbol, amount, timeframes, strategy, risk);

    res.status(200).json({
      success: true,
      message: 'Trading bot started.',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Stop bot controller
 */
export const stopBotController = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required.',
      });
    }

    await stopTradingBot(userId);

    res.status(200).json({
      success: true,
      message: 'Trading bot stopped.',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Get bot status controller
 */
export const getBotStatusController = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required.',
      });
    }

    const status = await getBotStatus(userId);

    res.status(200).json({
      success: true,
      status,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
