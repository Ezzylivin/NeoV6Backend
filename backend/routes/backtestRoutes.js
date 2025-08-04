// File: backend/routes/backtestRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import Backtest from '../models/backtestModel.js';

const router = express.Router();

// GET /api/backtest/results?timeframe=1h
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
