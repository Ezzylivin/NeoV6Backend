// File: backend/routes/backtestRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import Backtest from '../models/backtestModel.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { runBacktestAndStore } from '../services/backtestService.js';

const router = express.Router();

// Any authenticated user can get their backtest results (optionally filter by timeframe)
router.get('/results', protect, async (req, res) => {
  try {
    const { timeframe } = req.query;
    const filter = { userId: req.user._id };
    if (timeframe) filter.timeframe = timeframe;

    const results = await Backtest.find(filter).sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch backtest results' });
  }
});


// Only admin or analyst roles can trigger backtest runs
router.post('/run', protect, authorizeRoles('admin', 'analyst'), async (req, res) => {
  try {
    const { timeframe } = req.body;
    const result = await runBacktestAndStore(req.user._id, timeframe);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to run backtest' });
  }
});


// POST /api/backtest/run
// Run backtest across all timeframes, store results, return summary
router.post('/run', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const results = await runBacktestAndStore(userId);
    res.json({ message: 'Backtest run complete', results });
  } catch (err) {
    res.status(500).json({ message: 'Failed to run backtest', error: err.message });
  }
});

// GET /api/backtest/results?timeframe=1h
// Fetch all backtest results for user, optionally filtered by timeframe
router.get('/results', protect, async (req, res) => {
  try {
    const { timeframe } = req.query;

    const filter = { userId: req.user._id };
    if (timeframe) {
      filter.timeframe = timeframe;
    }

    const results = await Backtest.find(filter).sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch backtest results' });
  }
});

export default router;
