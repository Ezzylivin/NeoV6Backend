import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { runBacktestHandler, getBacktestResultsHandler } from '../services/backtestService.js';

const router = express.Router();

router.get('/', protect, runBacktestHandler);
router.get('/results', protect, getBacktestResultsHandler);

export default router;
