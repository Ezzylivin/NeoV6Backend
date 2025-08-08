// File: backend/routes/backtestRoutes.js
import express from 'express';
// import { protect } from '../middleware/authMiddleware.js';
import { runAndSaveBacktests  } from '../controllers/backtestController.js';

const router = express.Router();

// GET: Fetch stored backtest results
router.post('/api/backtests', runAndSaveBacktests);

export default router;
