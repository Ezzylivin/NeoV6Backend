// File: backend/services/priceService.js
import fetch from "node-fetch";

let prices = {};

// --- Fetch prices from Binance REST API ---
export const updatePrices = async (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) => {
  try {
    const responses = await Promise.all(
      symbols.map((symbol) =>
        fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
          .then((res) => res.json())
      )
    );

    responses.forEach((data) => {
      if (data.symbol && data.price) {
        prices[data.symbol] = parseFloat(data.price);
      }
    });
  } catch (err) {
    console.error("Failed to fetch Binance prices:", err.message);
  }
};

// --- Start periodic price updates ---
export const startPriceFeed = (intervalMs = 5000) => {
  updatePrices(); // initial fetch
  setInterval(updatePrices, intervalMs); // fetch every 5s
};

// --- Get current prices for requested symbols ---
export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) => {
  const result = {};
  symbols.forEach((s) => {
    result[s] = prices[s] || null;
  });
  return result;
};
