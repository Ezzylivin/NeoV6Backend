// File: services/priceService.js
import Price from "../dbStructure/price.js";
import fetch from "node-fetch";
import Redis from "ioredis";

// --- Redis (shared cache for multi-instance setups) ---
let redis;
try {
  redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  console.log("[PriceService] Connected to Redis");
} catch (err) {
  console.warn("[PriceService] Redis unavailable, falling back to in-memory cache");
  redis = null;
}

// --- In-memory cache fallback ---
let prices = {}; // { symbol: latestPrice }

// --- Symbol Normalizer (US exchanges only) ---
const normalizeSymbol = (symbol, exchange) => {
  const base = symbol.replace("USDT", "").replace("USD", ""); // strip suffix
  switch (exchange) {
    case "coinbase":
      return `${base}-USD`; // BTC-USD
    case "gemini":
      return `${base.toLowerCase()}usd`; // btcusd
    case "binanceus":
      return `${base}USD`; // BTCUSD
    default:
      return symbol;
  }
};

// --- Helper: Retry wrapper ---
const retry = async (fn, attempts = 3, delayMs = 500) => {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[PriceService] Attempt ${i + 1} failed: ${err.message}`);
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
};

// --- Exchange Fetchers ---
const fetchFromCoinbase = async (symbol) => {
  const product = normalizeSymbol(symbol, "coinbase");
  const url = `https://api.exchange.coinbase.com/products/${product}/ticker`;

  const res = await fetch(url, { timeout: 5000 });
  if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
  const data = await res.json();
  return { close: parseFloat(data.price), timestamp: new Date() };
};

const fetchFromGemini = async (symbol) => {
  const product = normalizeSymbol(symbol, "gemini");
  const url = `https://api.gemini.com/v1/pubticker/${product}`;

  const res = await fetch(url, { timeout: 5000 });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return { close: parseFloat(data.last), timestamp: new Date() };
};

const fetchFromBinanceUS = async (symbol) => {
  const product = normalizeSymbol(symbol, "binanceus");
  const url = `https://api.binance.us/api/v3/ticker/price?symbol=${product}`;

  const res = await fetch(url, { timeout: 5000 });
  if (!res.ok) throw new Error(`BinanceUS HTTP ${res.status}`);
 
