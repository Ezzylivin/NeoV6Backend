// File: backend/routes/botRoutes.js
import express from 'express';
// import { protect } from '../middleware/authMiddleware.js';
// import { authorizeRoles } from '../middleware/roleMiddleware.js';

import {
  startBotHandler,
  stopBotHandler,
  getBotStatusHandler,
} from '../controllers/botController.js';

const router = express.Router();

// const allowedRoles = ['trader', 'admin'];

router.post('/start', /* protect, authorizeRoles(allowedRoles), */ startBotHandler);
router.post('/stop', /* protect, authorizeRoles(allowedRoles), */ stopBotHandler);
router.get('/status', /* protect, authorizeRoles(allowedRoles), */ getBotStatusHandler);

// Test route (public)
router.get('/info', (req, res) => {
  res.json({ bot: 'Bot endpoint is working.' });
});

export default router;
