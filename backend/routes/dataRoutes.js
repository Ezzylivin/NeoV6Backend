import express from 'express';
// Import the new controller function
import { getLivePrices, getCandles, getPriceHistory } from '../controllers/dataController.js';

const router = express.Router();

// Route for live price tickers
router.get('/live', getLivePrices);

// Route for full candlestick data
router.get('/candles', getCandles);

// --- NEW ROUTE ADDED ---
// Route for simplified historical data (time, price)
router.get('/history', getPriceHistory);

export default router;
