// File: backend/services/priceService.js
import WebSocket from "ws";
import Price from "../dbStructure/price.js";

let prices = {};

export const startPriceFeed = () => {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);
    for (const ticker of data) {
      const symbol = ticker.s; // e.g., BTCUSDT
      const price = parseFloat(ticker.c); // last price
      prices[symbol] = price;

      // Save to MongoDB for historical tracking
      try {
        await Price.create({ symbol, price });
      } catch (err) {
        console.error("Error logging price:", err.message);
      }
    }
  });

  ws.on("close", () => {
    console.log("Binance WS closed, reconnecting in 5s...");
    setTimeout(startPriceFeed, 5000);
  });

  ws.on("error", (err) => {
    console.error("Binance WS error:", err.message);
    ws.close();
  });
};

export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  let result = {};
  symbols.forEach((s) => {
    result[s] = prices[s] || null;
  });
  return result;
};
