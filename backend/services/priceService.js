// backend/services/priceService.js
import WebSocket from "ws";
import Price from "../dbStructure/price.js";

let prices = {};
let lastSaved = {}; // tracks last DB save time per symbol

export const startPriceFeed = () => {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      for (const ticker of data) {
        const symbol = ticker.s; // e.g. BTCUSDT
        const price = parseFloat(ticker.c);
        prices[symbol] = price;

        // --- Throttling: only save every 10 seconds per symbol ---
        const now = Date.now();
        if (!lastSaved[symbol] || now - lastSaved[symbol] >= 10_000) {
          await Price.create({ symbol, price });
          lastSaved[symbol] = now;
        }
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

export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  let result = {};
  symbols.forEach((s) => {
    result[s] = prices[s] || null;
  });
  return result;
};
