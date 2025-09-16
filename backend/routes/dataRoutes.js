// File: backend/routes/dataRoutes.js
import express from 'express';
// Import the new controller function
import { getLivePrices, getCandles, getPriceHistory } from '../controllers/dataController.js';
import { getBacktestOptions as getBacktestOptionsController } from '../controllers/backtestController.js';

const router = express.Router();

// Route for live price tickers
router.get('/live', getLivePrices);

// Route for full candlestick data
router.get('/candles', getCandles);

// Route for simplified historical data (time, price)
router.get('/history', getPriceHistory);

// NEW ROUTE: Fetch options from your Python service
router.get('/options', getBacktestOptionsController); // Corrected route

export default router;
