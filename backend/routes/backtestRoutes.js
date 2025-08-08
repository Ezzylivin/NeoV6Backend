// File: backend/routes/backtestRoutes.js
import express from 'express';
// import { protect } from '../middleware/authMiddleware.js';
import { createBacktest, getBacktestByUser } from '../controllers/backtestController.js';

const router = express.Router();

// GET: Fetch stored backtest results
router.post('/create', createBacktest);

// POST: Run a new backtest and store the result
router.get['/use/:userId', getBacktesByUser);


export 
