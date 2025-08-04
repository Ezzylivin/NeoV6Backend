// File: backend/routes/botRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { startBotHandler, stopBotHandler, getBotStatusHandler } from '../services/botService.js';
import {
  logToDb
} from '../services/loggerService.js';

const router = express.Router();

// POST /api/bot/start
router.post('/start', protect, async (req, res) => {
  const { symbol, amount, timeframes } = req.body;

  if (!symbol || !amount) {
    return res.status(400).json({ message: 'symbol and amount are required.' });
  }

  const tfArray = Array.isArray(timeframes) && timeframes.length > 0
    ? timeframes
    : ['5m'];

  try {
    await startTradingBot(req.user._id, symbol, amount, tfArray);
    await logToDb(req.user._id, `Bot started for ${symbol} with ${amount} on ${tfArray.join(', ')}`);
    res.json({ status: `Bot started for ${symbol} amount ${amount} on ${tfArray.join(', ')}` });
  } catch (err) {
    await logToDb(req.user._id, `Error starting bot: ${err.message}`);
    res.status(500).json({ message: 'Failed to start bot', error: err.message });
  }
});

// POST /api/bot/stop
router.post('/stop', protect, async (req, res) => {
  try {
    await stopTradingBot(req.user._id);
    await logToDb(req.user._id, 'Bot stopped');
    res.json({ status: 'Bot stop command received.' });
  } catch (err) {
    await logToDb(req.user._id, `Error stopping bot: ${err.message}`);
    res.status(500).json({ message: 'Failed to stop bot', error: err.message });
  }
});

// GET /api/bot/status
router.get('/status', protect, async (req, res) => {
  try {
    const status = await getBotStatus(req.user._id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: 'Could not get bot status', error: err.message });
  }
});

export default router;
