// backend/services/priceService.js
import WebSocket from "ws";
import Price from "../models/Price.js"; // <-- new Price model (create it if you haven’t)
import mongoose from "mongoose";

let prices = {};

export const startPriceFeed = () => {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      for (const ticker of data) {
        const symbol = ticker.s; // e.g. BTCUSDT
        const price = parseFloat(ticker.c);

        // 1. Keep it in memory for fast frontend requests
        prices[symbol] = price;

        // 2. Save into DB (optional throttle: only every 5s per symbol)
        await Price.create({ symbol, price });
      }
    } catch (err) {
      console.error("❌ Error processing price feed:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("⚠️ Binance WS closed, reconnecting...");
    setTimeout(startPriceFeed, 5000);
  });

  ws.on("error", (err) => {
    console.error("❌ Binance WS error:", err.message);
  });
};

// Still used for frontend fetching
export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  let result = {};
  symbols.forEach((s) => {
    result[s] = prices[s] || null;
  });
  return result;
};
