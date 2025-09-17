// File: services/priceService.js
import Price from "../dbStructure/price.js";
import fetch from "node-fetch";
import Redis from "ioredis";

// --- Redis Connection (Cloud or local fallback) ---
let redis = null;
if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL);
    console.log("[PriceService] Connected to Redis Cloud");
  } catch (err) {
    console.warn("[PriceService] Redis connection failed, fallback to memory cache");
    redis = null;
  }
} else {
  console.warn("[PriceService] No REDIS_URL provided, using memory cache only");
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
  const data = await res.json();
  return { close: parseFloat(data.price), timestamp: new Date() };
};

// --- Multi-exchange fallback ---
export const fetchPrice = async (symbol) => {
  const exchanges = [
    () => retry(() => fetchFromCoinbase(symbol)),
    () => retry(() => fetchFromGemini(symbol)),
    () => retry(() => fetchFromBinanceUS(symbol)),
  ];
  for (const ex of exchanges) {
    try {
      return await ex();
    } catch (err) {
      console.warn(`[PriceService] ${ex.name} failed for ${symbol}:`, err.message);
    }
  }
  throw new Error(`All US exchanges failed for ${symbol}`);
};

// --- Save price to DB + cache ---
export const savePrice = async (symbol, fetchPriceFn = fetchPrice) => {
  const fetchedData = await fetchPriceFn(symbol);

  const priceDataForDB = {
    symbol: symbol, // keep original input symbol ("BTCUSDT")
    open: fetchedData.close,
    high: fetchedData.close,
    low: fetchedData.close,
    close: fetchedData.close,
    timestamp: fetchedData.timestamp,
  };

  const price = new Price(priceDataForDB);
  await price.save();

  // Cache in Redis if available
  if (redis) {
    await redis.set(`price:${symbol}`, fetchedData.close, "EX", 60); // expire after 60s
  } else {
    prices[symbol] = fetchedData.close;
  }

  return price;
};

// --- Get historical prices ---
export const getHistory = async (symbol, period = 24, interval = 60) => {
  const end = new Date();
  const start = new Date(end.getTime() - period * 60 * 60 * 1000);

  let history = await Price.find({
    symbol,
    timestamp: { $gte: start, $lte: end },
  })
    .sort({ timestamp: 1 })
    .lean();

  const filtered = [];
  let lastTime = 0;
  for (const p of history) {
    const time = new Date(p.timestamp).getTime();
    if (time - lastTime >= interval * 1000) {
      filtered.push({ time: Math.floor(time / 1000), price: p.close });
      lastTime = time;
    }
  }
  return filtered;
};

// --- Get candlestick data ---
export const getCandles = async (symbol, period = 24, interval = 60) => {
  const rawHistory = await getHistory(symbol, period, 1);
  const candles = [];
  let candle = null;

  for (const p of rawHistory) {
    const time = Math.floor(p.time / interval) * interval;
    if (!candle || candle.time !== time) {
      if (candle) candles.push(candle);
      candle = {
        time,
        open: p.price,
        high: p.price,
        low: p.price,
        close: p.price,
      };
    } else {
      candle.high = Math.max(candle.high, p.price);
      candle.low = Math.min(candle.low, p.price);
      candle.close = p.price;
    }
  }
  if (candle) candles.push(candle);
  return candles;
};

// --- Get live prices (from Redis or memory) ---
export const getPrices = async (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) => {
  if (!Array.isArray(symbols)) symbols = [symbols];
  const result = {};

  if (redis) {
    const pipeline = redis.pipeline();
    symbols.forEach((s) => pipeline.get(`price:${s}`));
    const values = await pipeline.exec();
    symbols.forEach((s, i) => {
      result[s] = values[i][1] ? parseFloat(values[i][1]) : null;
    });
  } else {
    symbols.forEach((s) => (result[s] = prices[s] || null));
  }

  return result;
};

// --- Start/stop auto price feed ---
let intervalHandle = null;

export const startPriceFeed = (
  symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
  intervalMs = 10000,
  fetchPriceFn = fetchPrice
) => {
  if (!Array.isArray(symbols)) symbols = [symbols];

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
  intervalHandle = setInterval(updateAll, intervalMs);
  console.log(`[PriceService] Started feed for ${symbols.join(", ")} every ${intervalMs}ms`);
};

export const stopPriceFeed = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    console.log("[PriceService] Price feed stopped");
    intervalHandle = null;
  }
};

export default {
  fetchPrice,
  savePrice,
  getHistory,
  getPrices,
  getCandles,
  startPriceFeed,
  stopPriceFeed,
};
