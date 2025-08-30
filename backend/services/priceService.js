// File: backend/services/priceService.js
import fetch from 'node-fetch';
import { logToDb } from './logService.js';

let prices = {};

/**
 * Fetch live prices from Binance REST API for multiple symbols
 */
export const updatePrices = async (symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']) => {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price');
    const data = await response.json();

    // Update local price cache
    symbols.forEach(symbol => {
      const ticker = data.find(t => t.symbol === symbol);
      if (ticker) prices[symbol] = parseFloat(ticker.price);
    });

    // Optionally log to DB for historical tracking
    // Object.entries(prices).forEach(([symbol, price]) => logToDb('SYSTEM', `${symbol}: $${price}`));

  } catch (err) {
    console.error('[PriceService] Failed to fetch prices:', err.message);
  }
};

/**
 * Return cached prices
 */
export const getPrices = (symbols = ['BTCUSDT', 'ETHUSDT']) => {
  let result = {};
  symbols.forEach(s => {
    result[s] = prices[s] || null;
  });
  return result;
};

/**
 * Start automatic price updates every N milliseconds
 */
export const startPriceFeed = (intervalMs = 5000) => {
  updatePrices(); // initial fetch
  setInterval(updatePrices, intervalMs);
};
