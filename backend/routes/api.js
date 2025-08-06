// File: backend/routes/api.js (Corrected Foundation)
import express from 'express';
// import { protect } from '../middleware/authMiddleware.js';

// import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import botRoutes from './botRoutes.js';
import logRoutes from './logRoutes.js';
import backtestRoutes from './backtestRoutes.js';

const router = express.Router();

// Public routes
router.use('/auth', authRoutes);

// Protected routes
 router.use('/user',userRoutes);
 router.use('/bot', botRoutes);
 router.use('/logs', logRoutes);
 router.use('/backtest', backtestRoutes);

export default router;
