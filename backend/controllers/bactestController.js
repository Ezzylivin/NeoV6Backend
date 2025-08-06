// File: backend/controllers/backtestController.js

import { runBacktestAndStore } from '../services/backtestService.js';
import Backtest from '../dbStructure/backtest.js';

// Run a new backtest for the current user
export const runBacktestHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required to run backtest.' });
    }

    const results = await runBacktestAndStore(userId);
    res.status(200).json({
      success: true,
      message: 'Backtest completed successfully.',
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('[BacktestController] runBacktestHandler error:', err);
    res.status(500).json({ success: false, error: 'Failed to run backtest.' });
  }
};

// Fetch all backtest results with optional filters and pagination
export const getBacktestResultsHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }

    const {
      symbol,
      timeframe,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { userId };

    if (symbol) filter.symbol = symbol.toUpperCase();
    if (timeframe) filter.timeframe = timeframe;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      Backtest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Backtest.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      results,
    });
  } catch (err) {
    console.error('[BacktestController] getBacktestResultsHandler error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch backtest results.' });
  }
};

// Fetch a single backtest result by its ID
export const getBacktestByIdHandler = async (req, res) => {
  try {
    const result = await Backtest.findById(req.params.id);

    if (!result) {
      return res.status(404).json({ error: 'Backtest result not found.' });
    }

    // Optional: check ownership
    // if (result.userId.toString() !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[BacktestController] getBacktestByIdHandler error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch result.' });
  }
};

// Delete a specific backtest result
export const deleteBacktestHandler = async (req, res) => {
  try {
    const result = await Backtest.findById(req.params.id);

    if (!result) {
      return res.status(404).json({ error: 'Backtest result not found.' });
    }

    // Optional: verify user ownership
    // if (result.userId.toString() !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await result.remove();

    res.status(200).json({ success: true, message: 'Backtest result deleted.' });
  } catch (err) {
    console.error('[BacktestController] deleteBacktestHandler error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete result.' });
  }
};
