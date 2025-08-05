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
router.use('./authRoutes', authRoutes);

// Protected routes
router.use('/userRoutes', protect, userRoutes);
router.use('/botRoutes', protect, botRoutes);
router.use('/backtestRoutes', protect, backtestRoutes);
router.use('/logRoutes', protect, logRoutes);

export default router;
