// File: backend/controllers/botController.js
import {
  startTradingBot as startBotService,
  stopTradingBot as stopBotService,
  getBotStatus as getBotStatusService,
} from '../services/botService.js';

export const startBotHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { symbol, amount, timeframes } = req.body;

    if (!userId || !symbol || !amount) {
      return res.status(400).json({ error: 'userId, symbol, and amount are required.' });
    }

    await startBotService(userId, symbol, amount, timeframes);
    res.status(200).json({ success: true, message: 'Trading bot started.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const stopBotHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' });
    }

    await stopBotService(userId);
    res.status(200).json({ success: true, message: 'Trading bot stopped.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getBotStatusHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' });
    }

    const status = await getBotStatusService(userId);
    res.status(200).json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
