// File: backend/routes/api.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';

import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import botRoutes from './botRoutes.js';
import backtestRoutes from './backtestRoutes.js';
import logRoutes from './logRoutes.js';

const router = express.Router();

// Public routes
router.use('/auth', authRoutes);

// Protected routes
router.use('/user', protect, userRoutes);
router.use('/bot', protect, botRoutes);
router.use('/backtest', protect, backtestRoutes);
router.use('/logs', protect, logRoutes);

export default router;
