// File: backend/routes/botRoutes.js
import express from 'express';

import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { startBotHandler, stopBotHandler, getBotStatusHandler } from// File: backend/routes/botRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  startBotHandler,
  stopBotHandler,
  getBotStatusHandler,
} from '../services/botService.js';

const router = express.Router();

// Roles allowed to manage bots
const allowedRoles = ['trader', 'admin'];

/**
 * @route   POST /api/bot/start
 * @desc    Start the trading bot for user
 * @access  Private (trader, admin)
 */
router.post('/start', protect, authorizeRoles(...allowedRoles), startBotHandler);

/**
 * @route   POST /api/bot/stop
 * @desc    Stop the trading bot for user
 * @access  Private (trader, admin)
 */
router.post('/stop', protect, authorizeRoles(...allowedRoles), stopBotHandler);

/**
 * @route   GET /api/bot/status
 * @desc    Get current status of trading bot
 * @access  Private (trader, admin)
 */
router.get('/status', protect, authorizeRoles(...allowedRoles), getBotStatusHandler);

/**
 * @route   GET /api/bot/info
 * @desc    Check if bot route is working (public test route)
 * @access  Public
 */
router.get('/info', (req, res) => {
  res.json({ bot: 'Bot endpoint is working.' });
});

export default router;
 '../services/botService.js';
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
