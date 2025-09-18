import Redis from "ioredis";
import Price from "../dbStructure/price.js";
import fetch from "node-fetch";

// Redis client (fallback to memory if Redis fails)
let redis;
try {
  redis = new Redis(process.env.REDIS_URL);
  redis.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
    redis = null;
  });
} catch (e) {
  console.warn("[Redis] Not configured, falling back to memory cache");
  redis = null;
}

let prices = {}; // in-memory fallback cache

// --- Example fetch (Coinbase) ---
const fetchFromCoinbase = async (symbol) => {
  const url = `https://api.exchange.coinbase.com/products/${symbol}-USD/ticker`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
  const data = await res.json();
  return { close: parseFloat(data.price), timestamp: new Date() };
};

// --- Multi-exchange fallback ---
export const fetchPrice = async (symbol) => {
  try {
    return await fetchFromCoinbase(symbol);
  } catch (err) {
    console.warn("[PriceService] Coinbase failed:", err.message);
    throw err;
  }
};

// --- Save price (DB + Redis + memory) ---
export const savePrice = async (symbol, fetchPriceFn = fetchPrice) => {
  const fetchedData = await fetchPriceFn(symbol);

  const priceDataForDB = {
    symbol,
    open: fetchedData.close,
    high: fetchedData.close,
    low: fetchedData.close,
    close: fetchedData.close,
    timestamp: fetchedData.timestamp,
  };

  const price = new Price(priceDataForDB);
  await price.save();

  if (redis) {
    await redis.set(`price:${symbol}`, fetchedData.close);
  } else {
    prices[symbol] = fetchedData.close;
  }

  return price;
};

// --- Get live prices ---
export const getPrices = async (symbols = ["BTCUSDT"]) => {
  if (!Array.isArray(symbols)) symbols = [symbols];
  const result = {};
  for (const s of symbols) {
    if (redis) {
      result[s] = await redis.get(`price:${s}`);
    } else {
      result[s] = prices[s] || null;
    }
  }
  return result;
};

// --- Start auto price feed ---
export const startPriceFeed = (
  symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
  intervalMs = 10000,
  fetchPriceFn = fetchPrice
) => {
  const updateAll = async () => {
    for (const symbol of symbols) {
      try {
        await savePrice(symbol, fetchPriceFn);
      } catch (err) {
        console.error(`[PriceService] Failed to update ${symbol}:`, err.message);
      }
    }
  };
  updateAll();
  setInterval(updateAll, intervalMs);
};

// --- NEW: Fetch all live exchange symbols dynamically ---
export const fetchAllExchangeSymbols = async () => {
  try {
    // Example: fetch symbols from Coinbase
    const res = await fetch("https://api.exchange.coinbase.com/products");
    if (!res.ok) throw new Error(`Coinbase symbols HTTP ${res.status}`);
    const data = await res.json();

    // Filter for USDT pairs
    const symbols = data
      .filter((p) => p.quote_currency === "USD" || p.quote_currency === "USDT")
      .map((p) => p.base_currency + p.quote_currency);

    return symbols;
  } catch (err) {
    console.error("[PriceService] Failed to fetch all exchange symbols:", err.message);
    return []; // fallback empty array
  }
};

// ✅ Named + default exports
export default {
  fetchPrice,
  savePrice,
  getPrices,
  startPriceFeed,
  fetchAllExchangeSymbols,
};
