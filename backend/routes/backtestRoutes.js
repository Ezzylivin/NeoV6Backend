// File: backend/routes/backtestRoutes.js
import express from 'express';
// import { protect } from '../middleware/authMiddleware.js';
// Import the controller functions
import { runBacktestAndStore } from '../services/backtestService.js';

const router = express.Router();

// GET route now just points to the controller function
router.get('/results', protect, runBacktestAndStore);

// POST route for running a new backtest
router.post('/run', protect, runBacktestAndStore);

export default router;
