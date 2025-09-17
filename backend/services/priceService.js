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

// ✅ Named + default exports
export default {
  fetchPrice,
  savePrice,
  getPrices,
  startPriceFeed,
};
