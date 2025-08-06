// File: backend/routes/apiRoutes.js
import express from 'express';

import authRoutes from './authRoutes.js';
import exchangeRoutes from './exchangeRoutes.js';
import cryptoRoutes from './cryptoRoutes.js';
import strategyRoutes from './strategyRoutes.js';
import backtestRoutes from './backtestRoutes.js';
import botRoutes from './botRoutes.js';
import logRoutes from './logRoutes.js';

const router = express.Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/exchange', exchangeRoutes);
router.use('/crypto', cryptoRoutes);
router.use('/strategy', strategyRoutes);
router.use('/backtest', backtestRoutes);
router.use('/bot', botRoutes);
router.use('/logs', logRoutes); // e.g., GET /api/logs

export default router;
