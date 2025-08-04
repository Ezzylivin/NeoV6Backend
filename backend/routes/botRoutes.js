import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { startBotHandler, stopBotHandler, getBotStatusHandler } from '../services/botService.js';

const router = express.Router();

router.post('/start', protect, startBotHandler);
router.post('/stop', protect, stopBotHandler);
router.get('/status', protect, getBotStatusHandler);

export default router;
