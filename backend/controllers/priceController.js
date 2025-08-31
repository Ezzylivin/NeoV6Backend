// File: src/controllers/priceController.js
import { getPrices, getHistory, getCandles } from "../services/priceService.js";

// GET /api/prices/live
export const fetchPrices = async (req, res) => {
  try {
    const symbols = req.query.symbols ? req.query.symbols.split(",") : ["BTCUSDT"];
    const prices = PriceService.getPrices(symbols);
    res.json({ success: true, prices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/prices/history
export const fetchPriceHistory = async (req, res) => {
  try {
    const symbols = req.query.symbols ? req.query.symbols.split(",") : ["BTCUSDT"];
    const period = parseInt(req.query.period) || 24;
    const interval = parseInt(req.query.interval) || 60;
    const history = {};
    for (const symbol of symbols) {
      history[symbol] = await PriceService.getHistory(symbol, period, interval);
    }
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/prices/candles
export const fetchCandles = async (req, res) => {
  try {
    const symbols = req.query.symbols ? req.query.symbols.split(",") : ["BTCUSDT"];
    const period = parseInt(req.query.period) || 24;
    const interval = parseInt(req.query.interval) || 60;
    const candles = {};
    for (const symbol of symbols) {
      candles[symbol] = await PriceService.getCandles(symbol, period, interval);
    }
    res.json({ success: true, candles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
