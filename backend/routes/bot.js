// File: backend/routes/bot.js
import express from 'express';
import { startTradingBot, stopTradingBot } from '../services/botService.js';

const router = express.Router();

// GET /api/bot/info - Example bot info route
router.get('/info', (req, res) => {
  res.json({ bot: 'Bot endpoint is working.' });
});

// POST /api/bot/start - Start the trading bot
router.post('/start', async (req, res) => {
  const { userId, symbol, amount, timeframes } = req.body;
  try {
    await startTradingBot(userId, symbol, amount, timeframes);
    res.status(200).json({ message: 'Bot started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bot/stop - Stop the trading bot
router.post('/stop', (req, res) => {
  const { userId } = req.body;
  try {
    stopTradingBot(userId);
    res.status(200).json({ message: 'Bot stopped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
