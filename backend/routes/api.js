import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import botRoutes from './botRoutes.js';
import backtestRoutes from './backtestRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/bot', botRoutes);
router.use('/backtest', backtestRoutes);

export default router;
