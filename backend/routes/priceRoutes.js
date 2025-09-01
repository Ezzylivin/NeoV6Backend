import express from "express";
import PriceService from "../services/priceService.js"; // default import

const router = express.Router();

// --- GET live prices ---
router.get("/live", async (req, res) => {
  const { symbols } = req.query;
  const syms = symbols ? symbols.split(",") : ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
  try {
    const prices = PriceService.getPrices(syms); // cached
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
      const candles = await PriceService.getCandles(sym, parseInt(period), parseInt(interval));
      result[sym] = candles;
    }
    res.json({ success: true, candles: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- GET historical line chart data (optional) ---
router.get("/history", async (req, res) => {
  const { symbols, period = 24, interval = 60 } = req.query;
  const syms = symbols ? symbols.split(",") : ["BTCUSDT"];
  try {
    const result = {};
    for (const sym of syms) {
      const history = await PriceService.getHistory(sym, parseInt(period), parseInt(interval));
      result[sym] = history;
    }
    res.json({ success: true, history: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
