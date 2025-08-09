// File: backend/routes/botRoutes.js
import express from 'express';
// import { protect } from '../middleware/authMiddleware.js';
// import { authorizeRoles } from '../middleware/roleMiddleware.js';

import {startBotController, stopBotController, getBotStatusController } from '../controllers/botController.js';

const router = express.Router();

// const allowedRoles = ['trader', 'admin'];

router.post('/' , /* protect, authorizeRoles(allowedRoles), */ startBotController);
router.post('/', /* protect, authorizeRoles(allowedRoles), */ stopBotController);
router.get('/', /* protect, authorizeRoles(allowedRoles), */ getBotStatusController);

// Test route (public)
router.get('/test', (req, res) => {
  res.json({ bot: 'Bot endpoint is working.' });
});

export default router;
