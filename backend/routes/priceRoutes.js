import express from 'express';
import { fetchPrices, fetchPriceHistory, fetchCandles } from '../controllers/priceController.js';

const router = express.Router();

// Live prices
router.get('/live', fetchPrices);

// Historical price data (supports period & interval)
router.get('/history', fetchPriceHistory);

// Candlestick data (supports period & interval)
router.get('/candles', fetchCandles);

export default router;
