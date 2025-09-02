// src/backend/routes/exchangeRoutes.js
import express from 'express';
import { fetchUSSpotMarkets } from '../utils/exchanges.js';

const router = express.Router();

router.get('/spot-markets', async (req, res) => {
  try {
    const markets = await fetchUSSpotMarkets();
    res.json({ markets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch spot markets' });
  }
});

export default router;
