// File: backend/routes/priceRoutes.js
import express from 'express';
import { fetchLivePrices, fetchPriceHistory } from '../controllers/priceController.js';

const router = express.Router();

// GET /api/prices/live?symbols=BTCUSDT,ETHUSDT
router.get('/prices/live', fetchLivePrices);

// GET /api/prices/history?symbol=BTCUSDT&limit=100
router.get('/prices/history', fetchPriceHistory);

export default router;
