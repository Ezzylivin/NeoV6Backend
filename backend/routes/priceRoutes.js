import express from 'express';
import { fetchPrices, fetchPriceHistory } from '../controllers/priceController.js';

const router = express.Router();

// GET /api/prices?symbols=BTCUSDT,ETHUSDT
router.get('/live', fetchPrices);

// GET /api/prices/history?symbol=BTCUSDT&limit=100
router.get('/history', fetchPriceHistory);

router.get("/candles", fetchCandles);

export default router;
