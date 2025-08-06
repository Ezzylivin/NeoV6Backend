// File: backend/routes/api.js (Corrected Foundation)
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';

import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import botRoutes from './botRoutes.js';
import logRoutes from './logRoutes.js';
import backtestRoutes from './backtestRoutes.js';

const router = express.Router();

// Public routes
router.use('/auth', authRoutes);

// Protected routes
router.use('/user', protect, userRoutes);
router.use('/bot', protect, botRoutes);
router.use('/logs', protect, logRoutes);
router.use('/backtest', protect, backtestRoutes);

export default router;
