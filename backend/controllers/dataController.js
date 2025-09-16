// File: backend/controllers/dataController.js
// UPGRADED: Now imports business logic from backtestDataService.js.

import * as dataService from '../services/backtestDataService.js';

// Fetches a list of valid symbols and timeframes.
// This is an API endpoint wrapper for the service function.
export const getBacktestOptions = async (req, res) => {
    try {
        const { symbols, timeframes } = await dataService.getBacktestOptionsData();
        return res.status(200).json({ 
            success: true, 
            data: { symbols, timeframes } 
        });
    } catch (error) {
        console.error("Failed to fetch backtest options from exchange:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to fetch backtest options from exchange." 
        });
    }
};

// NEW: Fetches live prices for a set of symbols
export const getLivePrices = async (req, res) => {
    const { symbols } = req.query;
    if (!symbols) {
        return res.status(400).json({ success: false, message: "Symbols parameter is required." });
    }
    
    const symbolsList = symbols.split(',');

    try {
        // Use the service function
        const tickers = await dataService.fetchLiveTickersData('coinbasepro', symbolsList);
        if (tickers) {
            return res.status(200).json({ success: true, data: tickers });
        } else {
            return res.status(500).json({ success: false, message: "Failed to retrieve live prices." });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Fetches candlestick data from multiple exchanges.
export const getCandles = async (req, res) => {
    const { symbol, timeframe } = req.query;
    if (!symbol || !timeframe) {
        return res.status(400).json({ success: false, message: "Symbol and timeframe are required." });
    }
    try {
        // Use the service function
        const { candles } = await dataService.fetchOHLCVMultiSafe(symbol, timeframe);
        if (candles) {
             return res.status(200).json({ success: true, data: { candles } });
        } else {
             return res.status(500).json({ success: false, message: `Failed to retrieve candles for ${symbol}.` });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// This is the function that your backtestService.js needs.
// It's just re-exporting the service function for proper dependency flow.
export const fetchOHLCVMultiSafe = dataService.fetchOHLCVMultiSafe;

// This is a placeholder for your price history logic.
export const getPriceHistory = async (req, res) => {
    res.status(200).json({ success: true, message: "Price history not yet implemented." });
};
