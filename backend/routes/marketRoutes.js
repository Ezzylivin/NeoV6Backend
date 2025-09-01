// File: src/backend/routes/marketRoutes.js
import express from "express";
import ccxt from "ccxt";

const router = express.Router();

// GET /api/candles?symbol=BTC/USD&exchange=coinbase&timeframe=1m
router.get("/candles", async (req, res) => {
  try {
    const { symbol = "BTC/USD", exchange = "coinbase", timeframe = "1m" } = req.query;

    const ex = new ccxt[exchange]();
    const ohlcv = await ex.fetchOHLCV(symbol, timeframe, undefined, 200);

    const candles = ohlcv.map(([time, open, high, low, close]) => ({
      time: Math.floor(time / 1000), // seconds
      open,
      high,
      low,
      close,
    }));

    res.json(candles);
  } catch (err) {
    console.error("Error fetching candles:", err);
    res.status(500).json({ error: "Failed to fetch candles" });
  }
});

export default router;
