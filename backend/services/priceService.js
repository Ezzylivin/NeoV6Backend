import Redis from "ioredis";
import Price from "../dbStructure/price.js";
import Cache from "../dbStructure/cache.js";
import fetch from "node-fetch";

const SYMBOLS_CACHE_KEY = "exchange_symbols::usd";
const SYMBOLS_CACHE_MS = 15 * 60 * 1000; // 15 minutes

// --- Redis client (fallback to memory if Redis fails) ---
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

// --- Fetch price from Coinbase US ---
// UPDATED: Now expects a symbol format like "BTC-USD" and uses it directly.
const fetchFromCoinbase = async (symbol) => {
  const url = `https://api.exchange.coinbase.com/products/${symbol}/ticker`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Coinbase HTTP ${res.status} for ${symbol}`);
  const data = await res.json();
  return { close: parseFloat(data.price), timestamp: new Date() };
};

// --- Multi-exchange fallback ---
export const fetchPrice = async (symbol) => {
  try {
    return await fetchFromCoinbase(symbol);
  } catch (err) {
    console.warn("[PriceService] Coinbase fetch failed:", err.message);
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

  // Save to MongoDB
  const price = new Price(priceDataForDB);
  await price.save();

  // Save to Redis or memory
  if (redis) {
    await redis.set(`price:${symbol}`, fetchedData.close);
  } else {
    prices[symbol] = fetchedData.close;
  }

  return price;
};

// --- Get live prices ---
// UPDATED: Default symbol is now in the correct "BTC-USD" format.
export const getPrices = async (symbols = ["BTC-USD"]) => {
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
// UPDATED: Default symbols now use the correct "BASE-QUOTE" format.
export const startPriceFeed = (
  symbols = ["BTC-USD", "ETH-USD", "SOL-USD"],
  intervalMs = 10000,
  fetchPriceFn = fetchFromCoinbase
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

// --- Fetch all tradable symbols from US exchanges dynamically ---
// UPDATED: Filters for USD pairs and returns the correct symbol ID (e.g., "BTC-USD").
export const fetchAllExchangeSymbols = async () => {
  try {
    // Serve from the TTL cache — the symbol list barely changes, so we don't
    // need to hit Coinbase's /products (hundreds of items) on every request.
    const cached = await Cache.findOne({ key: SYMBOLS_CACHE_KEY });
    if (cached?.data) return cached.data;

    const res = await fetch("https://api.exchange.coinbase.com/products");
    if (!res.ok) throw new Error(`Coinbase symbols HTTP ${res.status}`);
    const data = await res.json();
    // Filter for pairs quoted in USD (the primary US currency) and map to the product ID.
    const symbols = data
      .filter((p) => p.quote_currency === "USD")
      .map((p) => p.id);

    await Cache.findOneAndUpdate(
      { key: SYMBOLS_CACHE_KEY },
      { data: symbols, expiresAt: new Date(Date.now() + SYMBOLS_CACHE_MS) },
      { upsert: true, new: true }
    );
    return symbols;
  } catch (err) {
    console.error("[PriceService] Failed fetching symbols:", err.message);
    return [];
  }
};

// --- Fetch all exchange-supported timeframes, TP, SL ---
export const fetchAllExchangeParams = async () => {
  try {
    // Predefined common options for US exchanges
    const timeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
    const takeProfits = [0.01, 0.02, 0.03, 0.05, 0.1];
    const stopLosses = [0.01, 0.02, 0.03, 0.05, 0.1];
    return { timeframes, takeProfits, stopLosses };
  } catch (err) {
    console.error("[PriceService] Failed fetching params:", err.message);
    return { timeframes: [], takeProfits: [], stopLosses: [] };
  }
};

// --- Exports ---
export default {
  fetchPrice,
  savePrice,
  getPrices,
  startPriceFeed,
  fetchAllExchangeSymbols,
  fetchAllExchangeParams,
};
