// File: backend/routes/botRoutes.js
import express from 'express';

import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { startBotHandler, stopBotHandler, getBotStatusHandler } from '../services/botService.js';
import { startTradingBot, stopTradingBot } from '../services/botService.js';

const router = express.Router();

// Roles allowed to manage bots
const allowedRoles = ['trader', 'admin'];

router.post('/start', protect, authorizeRoles(...allowedRoles), startBotHandler);
router.post('/stop', protect, authorizeRoles(...allowedRoles), stopBotHandler);
router.get('/status', protect, authorizeRoles(...allowedRoles), getBotStatusHandler);



// Example GET /api/bot/info - just to check the route works
router.get('/info', (req, res) => {
  res.json({ bot: 'Bot endpoint is working.' });
});

// POST /api/bot/start - Start the trading bot
router.post('/start', async (req, res) => {
  const { userId, symbol, amount, timeframes } = req.body;
  if (!userId || !symbol || !amount || !timeframes) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    await startTradingBot(userId, symbol, amount, timeframes);
    res.status(200).json({ message: 'Bot started' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to start bot' });
  }
});

// POST /api/bot/stop - Stop the trading bot
router.post('/stop', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }
  try {
    await stopTradingBot(userId);
    res.status(200).json({ message: 'Bot stopped' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to stop bot' });
  }
});

export default router;
