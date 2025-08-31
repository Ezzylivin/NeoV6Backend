// backend/services/priceService.js
import fetch from "node-fetch";
import Price from "../dbStructure/price.js"; // MongoDB model

let livePrices = {};

// --- Exchange fetchers ---
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

const fetchFromKraken = async (symbol) => {
  const base = symbol.replace("USDT", "USD");
  const url = `https://api.kraken.com/0/public/Ticker?pair=${base}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kraken failed");
  const data = await res.json();
  const pairKey = Object.keys(data.result)[0];
  return parseFloat(data.result[pairKey].c[0]); // last trade
};

// --- Multi-exchange fetch with fallback ---
const fetchPrice = async (symbol) => {
  const exchanges = [fetchFromCoinbase, fetchFromGemini, fetchFromKraken];
  for (const ex of exchanges) {
    try {
      const price = await ex(symbol);
      if (price != null) return price;
    } catch (err) {
      console.warn(`[PriceService] ${ex.name} failed for ${symbol}:`, err.message);
    }
  }
  throw new Error(`All exchanges failed for ${symbol}`);
};

// --- Update live prices & save history ---
const updatePrices = async (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) => {
  for (const symbol of symbols) {
    try {
      const price = await fetchPrice(symbol);
      livePrices[symbol] = price;

      // Save to DB for historical charting
      await Price.create({
        symbol,
        price,
        timestamp: new Date(),
      });

      console.log(`[PriceService] ${symbol}: $${price}`);
    } catch (err) {
      console.error(`[PriceService] Failed for ${symbol}:`, err.message);
    }
  }
};

// --- Get cached live prices ---
const getPrices = (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) => {
  const result = {};
  symbols.forEach((s) => {
    result[s] = livePrices[s] || null;
  });
  return result;
};

// --- Fetch 24h history from MongoDB ---
const getHistory = async (symbol, hours = 24) => {
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);

  const records = await Price.find({ symbol, timestamp: { $gte: since } })
    .sort({ timestamp: 1 })
    .lean();

  // Aggregate into 5-minute buckets
  const buckets = {};
  records.forEach((r) => {
    const date = new Date(r.timestamp);
    const minutes = Math.floor(date.getMinutes() / 5) * 5;
    const bucketKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), minutes).toISOString();
    if (!buckets[bucketKey]) buckets[bucketKey] = [];
    buckets[bucketKey].push(r.price);
  });

  return Object.entries(buckets).map(([time, prices]) => ({
    time,
    price: prices.reduce((a, b) => a + b, 0) / prices.length,
  }));
};

// --- Start periodic price feed ---
const startPriceFeed = (intervalMs = 60000) => {
  updatePrices(); // initial fetch
  setInterval(updatePrices, intervalMs);
};

export default {
  fetchPrice,
  updatePrices,
  getPrices,
  getHistory,
  startPriceFeed,
};
