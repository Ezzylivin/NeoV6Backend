// File: backend/routes/backtestRoutes.js
import express from 'express';
// import { protect } from '../middleware/authMiddleware.js';
import { runBacktestAndStore } from '../services/backtestService.js';

const router = express.Router();

// GET: Fetch stored backtest results
router.get('/results', runBacktestAndStore);

// POST: Run a new backtest and store the result
router.post('/run', runBacktestAndStore); // You may want a different handler if POST behaves differently

export default router;
