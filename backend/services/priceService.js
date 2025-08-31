// File: src/backend/services/priceService.js

import fetch from "node-fetch";
import Price from "../dbStructure/price.js"; // MongoDB model

// In-memory cache for live prices
let prices = {};

// --- US-based exchange fetchers ---
const fetchFromCoinbase = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const url = `https://api.exchange.coinbase.com/products/${base}-USD/ticker`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Coinbase failed");
  const data = await res.json();
  return { close: parseFloat(data.price), timestamp: new Date() };
};

const fetchFromGemini = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const url = `https://api.gemini.com/v1/pubticker/${base.toLowerCase()}usd`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gemini failed");
  const data = await res.json();
  return { close: parseFloat(data.last), timestamp: new Date() };
};

const fetchFromKraken = async (symbol) => {
  const base = symbol.replace("USDT", "USD");
  const url = `https://api.kraken.com/0/public/Ticker?pair=${base}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kraken failed");
  const data = await res.json();
  const pairKey = Object.keys(data.result)[0];
  return { close: parseFloat(data.result[pairKey].c[0]), timestamp: new Date() };
};

// --- Multi-exchange fallback ---
export const fetchPrice = async (symbol) => {
  const exchanges = [fetchFromCoinbase, fetchFromGemini, fetchFromKraken];
  for (const ex of exchanges) {
    try {
      return await ex(symbol);
    } catch (err) {
      console.warn(`[PriceService] ${ex.name} failed for ${symbol}:`, err.message);
    }
  }
  throw new Error(`All exchanges failed for ${symbol}`);
};

// --- Save price to DB ---
export const savePrice = async (symbol) => {
  const data = await fetchPrice(symbol); // { close, timestamp }
  const price = new Price({ ...data, symbol });
  await price.save();
  prices[symbol] = data.close; // update in-memory cache
  return price;
};

// --- Fetch historical prices (last `period` hours, downsampled) ---
export const getHistory = async (symbol, period = 24, intervalSec = 60) => {
  const end = new Date();
  const start = new Date(end.getTime() - period * 60 * 60 * 1000);

  const history = await Price.find({
    symbol,
    timestamp: { $gte: start, $lte: end },
  })
    .sort({ timestamp: 1 })
    .lean();

  if (!history.length) return [];

  // Downsample → only keep 1 record per `intervalSec`
  const result = [];
  let lastTime = 0;

  for (const p of history) {
    const ts = new Date(p.timestamp).getTime();
    if (ts - lastTime >= intervalSec * 1000) {
      result.push({ time: p.timestamp, price: p.close });
      lastTime = ts;
    }
  }

  return result;
};

// --- Live price cache ---
export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) => {
  if (!Array.isArray(symbols)) {
    console.warn("[PriceService] getPrices called with non-array:", symbols);
    return {};
  }

  const result = {};
  symbols.forEach(s => {
    result[s] = prices[s] || null;
  });
  return result;
};

// --- Start auto price feed ---
export const startPriceFeed = (symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"], intervalMs = 10000) => {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    console.error("[PriceService] startPriceFeed received invalid symbols:", symbols);
    symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"];
  }

  const updateAll = async () => {
    try {
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            await savePrice(symbol);
          } catch (err) {
            console.error(`[PriceService] Failed to update ${symbol}:`, err.message);
          }
        })
      );
    } catch (err) {
      console.error("[PriceService] updateAll error:", err.message);
    }
  };

  console.log("[PriceService] Starting price feed...");
  updateAll(); // initial fetch
  setInterval(updateAll, intervalMs);
};

export default { fetchPrice, savePrice, getHistory, getPrices, startPriceFeed };
