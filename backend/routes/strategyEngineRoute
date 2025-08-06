// File: backend/routes/strategyRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { saveStrategy, getStrategies, runStrategy } from '../services/strategyService.js';

const router = express.Router();

// Save a new strategy
router.post('/', protect, saveStrategy);

// Get all user strategies
router.get('/', protect, getStrategies);

// Run a strategy
router.post('/run', protect, runStrategy);

export default router;
