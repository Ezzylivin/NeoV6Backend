// backend/services/priceService.js
import WebSocket from "ws";

let prices = {};

export const startPriceFeed = () => {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    data.forEach((ticker) => {
      const symbol = ticker.s; // BTCUSDT
      prices[symbol] = parseFloat(ticker.c); // last price
    });
  });

  ws.on("close", () => {
    console.log("Binance WS closed, reconnecting...");
    setTimeout(startPriceFeed, 5000);
  });
};

export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  let result = {};
  symbols.forEach((s) => {
    result[s] = prices[s] || null;
  });
  return result;
};
