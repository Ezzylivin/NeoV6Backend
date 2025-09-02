import express from 'express';
import {
  getBacktestOptions,
  runAndSaveBacktests,
  runBatchBacktestsController,
  getUserBacktests,
  createBacktest,
  getAllBacktests
} from '../controllers/backtestController.js';

const router = express.Router();

// Dropdown values
router.get('/options', getBacktestOptions);

// Run one backtest
router.post('/run', runAndSaveBacktests);

// Run batch backtests
router.post('/batch', runBatchBacktestsController);

// User-specific backtests
router.get('/user/:userId', getUserBacktests);

// CRUD/debug routes
router.post('/', createBacktest);
router.get('/', getAllBacktests);

export default router;
