// File: backend/controllers/dataController.js
import * as priceService from '../services/priceService.js';
import { fetchOHLCVMultiSafe } from '../services/candleService.js';

// Helper for consistent responses
const sendResponse = (res, data, message = 'Success', status = 200) => {
    res.status(status).json({ success: true, message, data });
};

const sendError = (res, error, controllerName) => {
    // Log the detailed error on the server for debugging
    console.error(`[${controllerName} Error]:`, error.message);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
};

export const getLivePrices = async (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) {
      return res.status(400).json({ success: false, message: "Symbols are required" });
    }
    const list = symbols.split(",");
    const prices = priceService.getPrices(list);
    sendResponse(res, prices);
  } catch (err) {
    sendError(res, err, 'getLivePrices');
  }
};

export const getCandles = async (req, res) => {
  try {
    const { symbol, timeframe = '1h', startDate, endDate } = req.query;
    if (!symbol) {
        return res.status(400).json({ success: false, message: "Symbol is required" });
    }
    
    const result = await fetchOHLCVMultiSafe(symbol, timeframe, undefined, startDate, endDate);
    sendResponse(res, result.candles);
  } catch (err) {
    sendError(res, err, 'getCandles');
  }
};
