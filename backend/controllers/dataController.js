import * as priceService from '../services/priceService.js';
import { fetchOHLCVMultiSafe } from '../services/candleService.js';

const sendResponse = (res, data, message = 'Success') => {
    res.status(200).json({ success: true, message, data });
};
const sendError = (res, error, controllerName) => {
    console.error(`[Controller Error: ${controllerName}]`, error);
    res.status(500).json({ 
        success: false, 
        message: error.message || "An internal server error occurred." 
    });
};

export const getLivePrices = async (req, res) => {
  // This function can remain as is, since priceService already uses US exchanges.
  // ...
};

export const getCandles = async (req, res) => {
  try {
    const { symbol, timeframe = '1h' } = req.query;
    if (!symbol) return res.status(400).json({ success: false, message: "Symbol is required" });
    
    // --- THIS IS THE FIX ---
    // Convert USDT symbols from the frontend to USD for US exchanges.
    const symbolForUS = symbol.toUpperCase().replace('USDT', 'USD');
    
    const result = await fetchOHLCVMultiSafe(symbolForUS, timeframe);
    sendResponse(res, result.candles);
  } catch (err) {
    sendError(res, err, 'getCandles');
  }
};

export const getPriceHistory = async (req, res) => {
  // This function can remain as is.
  // ...
};
