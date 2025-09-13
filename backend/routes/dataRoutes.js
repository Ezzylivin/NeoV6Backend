// File: backend/routes/dataRoutes.js
import express from 'express';
import { getLivePrices, getPriceHistory, getCandles } from '../controllers/dataController.js';
const router = express.Router();

// Public data endpoints
router.get('/live', getLivePrices);
router.get('/history', getPriceHistory);
router.get('/candles', getCandles);

export default router;
