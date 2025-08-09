// File: backend/routes/backtestRoutes.js
import express from 'express';
import { runAndSaveBacktests, getBacktestsByUser } from '../controllers/backtestController.js';

const router = express.Router();

// POST: Run backtests and save results
router.post('/backtests/run', runAndSaveBacktests);

// GET: Fetch saved backtest results, optionally filtered by userId and timeframe
router.get('/backtests/results', getBacktestsByUser);

export default router;
