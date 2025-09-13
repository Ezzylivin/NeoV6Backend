// File: backend/controllers/dataController.js
import * as priceService from '../services/priceService.js';
import { fetchOHLCVMultiSafe } from '../services/candleService.js';

// === GET live prices for symbols ===
export const getLivePrices = async (req, res) => {
  try {
    const { symbols } = req.query; // e.g. ?symbols=BTCUSDT,ETHUSDT
    if (!symbols) {
      return res.status(400).json({ message: "Symbols query parameter is required (comma-separated)" });
    }
    const symbolList = symbols.split(",");
    
    // CORRECT: Calls the 'getPrices' function from the service
    const prices = priceService.getPrices(symbolList);
    res.json(prices);
  } catch (err) {
    console.error("[getLivePrices Error]", err.message);
    res.status(500).json({ message: "Error fetching live prices", error: err.message });
  }
};

// === GET price history for a symbol (for line charts) ===
export const getPriceHistory = async (req, res) => {
  try {
    const { symbol, period = '24', interval = '60' } = req.query;
    if (!symbol) {
      return res.status(400).json({ message: "Symbol query parameter is required" });
    }
    
    // CORRECT: Calls the 'getHistory' function from the service
    const history = await priceService.getHistory(symbol, parseInt(period), parseInt(interval));
    res.json(history);
  } catch (err) {
    console.error("[getPriceHistory Error]", err.message);
    res.status(500).json({ message: "Error fetching price history", error: err.message });
  }
};

// === GET candlestick data for a symbol ===
export const getCandles = async (req, res) => {
    try {
        const { symbol, timeframe = '1h', startDate, endDate } = req.query;
        if (!symbol) {
            return res.status(400).json({ message: "Symbol query parameter is required" });
        }
        
        // This controller now correctly uses the robust candleService
        const result = await fetchOHLCVMultiSafe(symbol, timeframe, undefined, startDate, endDate);
        res.json(result.candles);
    } catch (err) {
        console.error('[getCandles Error]', err.message);
        res.status(500).json({ message: 'Error fetching candle data', error: err.message });
    }
};
