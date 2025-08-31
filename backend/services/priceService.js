// backend/services/priceService.js
import fetch from "node-fetch";
import Price from "../dbStructure/price.js"; // MongoDB model

let prices = {};

// --- US-based exchange fetchers only ---
const fetchFromCoinbase = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const url = `https://api.exchange.coinbase.com/products/${base}-USD/ticker`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Coinbase failed");
  const data = await res.json();
  return parseFloat(data.price);
};

const fetchFromGemini = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const url = `https://api.gemini.com/v1/pubticker/${base.toLowerCase()}usd`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gemini failed");
  const data = await res.json();
  return parseFloat(data.last);
};

// --- Multi-exchange fetch with fallback (US exchanges only) ---
const fetchPrice = async (symbol) => {
  const exchanges = [fetchFromCoinbase, fetchFromGemini];
  for (const ex of exchanges) {
    try {
      return await ex(symbol);
    } catch (err) {
      console.warn(`[PriceService] ${ex.name} failed for ${symbol}:`, err.message);
    }
  }
  throw new Error(`All US exchanges failed for ${symbol}`);
};

// --- Update tracked prices ---
const updatePrices = async (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) => {
  for (const symbol of symbols) {
    try {
      const price = await fetchPrice(symbol);
      prices[symbol] = price;

      // Save to DB for history
      await Price.create({ symbol, price, timestamp: new Date() });

      console.log(`[PriceService] ${symbol}: $${price}`);
    } catch (err) {
      console.error(`[PriceService] Failed for ${symbol}:`, err.message);
    }
  }
};

// --- Public getters ---
const getPrices = (symbols = ["BTCUSDT", "ETHUSDT"]) => {
  const result = {};
  symbols.forEach((s) => (result[s] = prices[s] || null));
  return result;
};

const startPriceFeed = (intervalMs = 10000) => {
  updatePrices(); // initial fetch
  setInterval(updatePrices, intervalMs);
};

export default { updatePrices, getPrices, startPriceFeed, fetchPrice };
