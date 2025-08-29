// File: backend/services/priceService.js
import WebSocket from "ws";

let prices = {};

// Start Binance WebSocket for live price updates
export const startPriceFeed = () => {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    data.forEach((ticker) => {
      const symbol = ticker.s; // e.g., BTCUSDT
      prices[symbol] = parseFloat(ticker.c); // last price
    });
  });

  ws.on("close", () => {
    console.warn("Binance WS closed, reconnecting in 5s...");
    setTimeout(startPriceFeed, 5000);
  });

  ws.on("error", (err) => {
    console.error("Binance WS error:", err.message);
  });
};

// Fetch latest prices from in-memory store
export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  const result = {};
  symbols.forEach((s) => {
    result[s] = prices[s] || null;
  });
  return result;
};

// Optional: Fetch from Binance REST API (Node 22+ fetch)
export const fetchRestPrices = async (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  try {
    const url = `https://api.binance.com/api/v3/ticker/price`;
    const res = await fetch(url);
    const data = await res.json();
    const result = {};
    symbols.forEach((s) => {
      const ticker = data.find((t) => t.symbol === s);
      result[s] = ticker ? parseFloat(ticker.price) : null;
    });
    return result;
  } catch (err) {
    console.error("REST price fetch error:", err.message);
    return {};
  }
};
