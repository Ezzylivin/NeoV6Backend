// File: backend/routes/botRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  startBotHandler,
  stopBotHandler,
  getBotStatusHandler,
} from '../services/botService.js';

const router = express.Router();

// Allowed roles for bot actions
const allowedRoles = ['trader', 'admin'];

/**
 * @route   POST /api/bot/start
 * @desc    Start the trading bot
 * @access  Private (trader, admin)
 */
router.post('/start', protect, authorizeRoles(...allowedRoles), startBotHandler);

/**
 * @route   POST /api/bot/stop
 * @desc    Stop the trading bot
 * @access  Private (trader, admin)
 */
router.post('/stop', protect, authorizeRoles(...allowedRoles), stopBotHandler);

/**
 * @route   GET /api/bot/status
 * @desc    Get bot running status
 * @access  Private (trader, admin)
 */
router.get('/status', protect, authorizeRoles(...allowedRoles), getBotStatusHandler);

/**
 * @route   GET /api/bot/info
 * @desc    Public test endpoint to confirm route works
 * @access  Public
 */
router.get('/info', (req, res) => {
  res.json({ bot: 'Bot endpoint is working.' });
});

export default router;
