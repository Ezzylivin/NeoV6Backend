import * as priceService from '../services/priceService.js';
import { fetchOHLCVMultiSafe } from '../services/candleService.js';

// Helper functions for consistent responses and errors
const sendResponse = (res, data, message = 'Success') => {
    res.status(200).json({ success: true, message, data });
};
const sendError = (res, error, controllerName) => {
    console.error(`[${controllerName} Error]:`, error.message);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
};

export const getLivePrices = async (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) return res.status(400).json({ success: false, message: "Symbols are required" });
    const list = symbols.split(",");
    const prices = priceService.getPrices(list);
    sendResponse(res, prices);
  } catch (err) {
    sendError(res, err, 'getLivePrices');
  }
};

export const getCandles = async (req, res) => {
  try {
    const { symbol, timeframe = '1h' } = req.query;
    if (!symbol) return res.status(400).json({ success: false, message: "Symbol is required" });
    const result = await fetchOHLCVMultiSafe(symbol, timeframe);
    sendResponse(res, result.candles);
  } catch (err) {
    sendError(res, err, 'getCandles');
  }
};

// --- NEW FUNCTION ADDED ---
/**
 * Fetches historical price data (for line charts).
 */
export const getPriceHistory = async (req, res) => {
  try {
    const { symbol, period = '24', interval = '60' } = req.query;
    if (!symbol) return res.status(400).json({ success: false, message: "Symbol is required" });
    
    const history = await priceService.getHistory(symbol, parseInt(period), parseInt(interval));
    sendResponse(res, history);
  } catch (err) {
    sendError(res, err, 'getPriceHistory');
  }
};
