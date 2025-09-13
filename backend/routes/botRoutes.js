// File: backend/routes/botRoutes.js
import express from 'express';
import {
  startBotController, stopBotController, getBotStatusController, getHistoryController
} from '../controllers/botController.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

// Protect all bot-related routes
router.use(protect);

router.post('/start', startBotController);
router.post('/stop', stopBotController);
router.get('/status', getBotStatusController);
router.get('/history', getHistoryController);

export default router;
