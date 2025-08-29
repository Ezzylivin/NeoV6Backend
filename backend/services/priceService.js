// File: backend/services/priceService.js
import fetch from "node-fetch";
import Price from "../dbStructure/price.js";

let prices = {}; // current prices

export const startPricePolling = () => {
  const fetchPrices = async () => {
    try {
      const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
      const url = `https://api.binance.com/api/v3/ticker/price`;
      const res = await fetch(url);
      const data = await res.json();

      data.forEach((ticker) => {
        if (symbols.includes(ticker.symbol)) {
          const price = parseFloat(ticker.price);
          prices[ticker.symbol] = price;

          // log to DB for backtesting
          Price.create({ symbol: ticker.symbol, price, timestamp: new Date() }).catch(() => {});
        }
      });
    } catch (err) {
      console.error("Price polling error:", err.message);
    }
  };

  fetchPrices();
  setInterval(fetchPrices, 5000); // every 5s
};

export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  let result = {};
  symbols.forEach((s) => {
    result[s] = prices[s] || null;
  });
  return result;
};
