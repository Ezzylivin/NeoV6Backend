// File: backend/services/priceService.js
import fetch from 'node-fetch';
import { logToDb } from './logService.js';

let prices = {};

const updatePrices = async (symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']) => {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price');
    const data = await response.json();

    symbols.forEach(symbol => {
      const ticker = data.find(t => t.symbol === symbol);
      if (ticker) prices[symbol] = parseFloat(ticker.price);
    });

    // Optional: log to DB
    // Object.entries(prices).forEach(([symbol, price]) => logToDb('SYSTEM', `${symbol}: $${price}`));

  } catch (err) {
    console.error('[PriceService] Failed to fetch prices:', err.message);
  }
};

const getPrices = (symbols = ['BTCUSDT', 'ETHUSDT']) => {
  let result = {};
  symbols.forEach(s => {
    result[s] = prices[s] || null;
  });
  return result;
};

const startPriceFeed = (intervalMs = 5000) => {
  updatePrices(); // initial fetch
  setInterval(updatePrices, intervalMs);
};

export default {
  updatePrices,
  getPrices,
  startPriceFeed,
};
