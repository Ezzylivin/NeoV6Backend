// File: backend/services/priceService.js
import fetch from 'node-fetch';
import { logToDb } from './logService.js';

let livePrices = {}; // cache for latest prices

const updateLivePrices = async (symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']) => {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price');
    const data = await response.json();

    symbols.forEach(symbol => {
      const ticker = data.find(t => t.symbol === symbol);
      if (ticker) livePrices[symbol] = parseFloat(ticker.price);
    });

    // Optional: log to DB
    // Object.entries(livePrices).forEach(([symbol, price]) =>
    //   logToDb('SYSTEM', `${symbol}: $${price}`)
    // );

  } catch (err) {
    console.error('[PriceService] Failed to fetch prices:', err.message);
  }
};

const getLivePrices = (symbols = ['BTCUSDT', 'ETHUSDT']) => {
  let result = {};
  symbols.forEach(s => {
    result[s] = livePrices[s] || null;
  });
  return result;
};

const startLivePriceFeed = (intervalMs = 5000) => {
  updateLivePrices(); // initial fetch
  setInterval(updateLivePrices, intervalMs);
};

export default {
  updateLivePrices,
  getLivePrices,
  startLivePriceFeed,
};
