// File: src/backend/routes/priceRoutes.js
import express from "express";
import * as PriceService from "../services/priceService.js";

const router = express.Router();

// --- GET live prices ---
router.get("/live", async (req, res) => {
  const { symbols } = req.query;
  const syms = symbols ? symbols.split(",") : ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
  try {
    const prices = await PriceService.fetchLivePrices(syms);
    res.json({ success: true, prices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- GET historical candlestick data ---
router.get("/candles", async (req, res) => {
  const { symbols, period = 24, interval = 60 } = req.query;
  const syms = symbols ? symbols.split(",") : ["BTCUSDT"];
  try {
    const result = {};
    for (const sym of syms) {
      const candles = await PriceService.fetchCandles(sym, parseInt(period), parseInt(interval));
      result[sym] = candles[sym] || [];
    }
    res.json({ success: true, candles: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
