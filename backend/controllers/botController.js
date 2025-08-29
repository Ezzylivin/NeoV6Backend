// File: backend/controllers/botController.js
import { startTradingBot, stopTradingBot, getBotStatus } from '../services/botService.js';

export const startBotController = async (req, res) => {
  try {
    const { userId, symbol, amount, timeframes, strategy, risk } = req.body;

    if (!userId || !symbol || !amount) {
      return res.status(400).json({ error: 'userId, symbol, and amount are required.' });
    }

    const bot = await startTradingBot({ userId, symbol, amount, timeframes, strategy, risk });
    res.status(200).json({ success: true, bot });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const stopBotController = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    await stopTradingBot(userId);
    res.status(200).json({ success: true, message: 'Trading bot stopped.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getBotStatusController = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    const bot = await getBotStatus(userId);
    res.status(200).json({ success: true, bot });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
