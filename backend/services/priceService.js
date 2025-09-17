// File: backend/services/priceService.js

import Redis from "ioredis";
import fetch from "node-fetch";
import Price from "../dbStructure/price.js";

let redis;
try {
  redis = new Redis(process.env.REDIS_URL);
  console.log("[PriceService] Connected to Redis");
} catch (err) {
  console.warn("[PriceService] Redis unavailable, falling back to in-memory cache");
  redis = null;
}

let memoryCache = {}; // fallback if Redis not available

// --- US-based exchange fetchers ---
const fetchFromCoinbase = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const url = `https://api.exchange.coinbase.com/products/${base}-USD/ticker`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Coinbase fetch failed");
  const data = await res.json();
  return { exchange: "coinbase", price: parseFloat(data.price) };
};

const fetchFromKraken = async (symbol) => {
  const base = symbol.replace("USDT", "USD");
  const url = `https://api.kraken.com/0/public/Ticker?pair=${base}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kraken fetch failed");
  const data = await res.json();
  const key = Object.keys(data.result)[0];
  return { exchange: "kraken", price: parseFloat(data.result[key].c[0]) };
};

// --- Cache helpers ---
async function setCache(symbol, priceObj) {
  const key = `price:${symbol}`;
  const val = JSON.stringify(priceObj);

  if (redis) {
    await redis.set(key, val, "EX", 30); // expire in 30s
  } else {
    memoryCache[key] = { val, expires: Date.now() + 30_000 };
  }
}

async function getCache(symbol) {
  const key = `price:${symbol}`;
  if (redis) {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } else {
    const entry = memoryCache[key];
    if (entry && entry.expires > Date.now()) {
      return JSON.parse(entry.val);
    }
    return null;
  }
}

// --- Main function ---
export async function getPrice(symbol) {
  // Try cache first
  const cached = await getCache(symbol);
  if (cached) return cached;

  // Otherwise fetch fresh
  const fetchers = [fetchFromCoinbase, fetchFromKraken];
  let priceObj = null;

  for (const fn of fetchers) {
    try {
      priceObj = await fn(symbol);
      break; // stop at first success
    } catch (err) {
      console.warn(`[PriceService] ${fn.name} failed for ${symbol}:`, err.message);
    }
  }

  if (!priceObj) {
    throw new Error(`Unable to fetch price for ${symbol}`);
  }

  // Save to cache + DB
  await setCache(symbol, priceObj);

  try {
    await Price.create({
      symbol,
      exchange: priceObj.exchange,
      price: priceObj.price,
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn("[PriceService] Failed to save price to DB:", err.message);
  }

  return priceObj;
}
