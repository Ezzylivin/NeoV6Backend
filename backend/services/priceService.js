import Price from "../dbStructure/price.js";
import fetch from "node-fetch";

let prices = {}; // in-memory cache

// --- US-based exchange fetchers ---
const fetchFromCoinbase = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const url = `https://api.exchange.coinbase.com/products/${base}-USD/ticker`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
      const data = await res.json();
      return { close: parseFloat(data.price), timestamp: new Date() };
    } catch (err) {
      console.warn(`[PriceService] Coinbase attempt ${attempt + 1} failed for ${symbol}:`, err.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 500)); // small delay before retry
    }
  }
  throw new Error("Coinbase failed after 3 attempts");
};

const fetchFromGemini = async (symbol) => {
  const base = symbol.replace("USDT", "").toLowerCase();
  const url = `https://api.gemini.com/v1/pubticker/${base}usd`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return { close: parseFloat(data.last), timestamp: new Date() };
};

const fetchFromKraken = async (symbol) => {
  const base = symbol.replace("USDT", "USD");
  const url = `https://api.kraken.com/0/public/Ticker?pair=${base}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
  const data = await res.json();
  const key = Object.keys(data.result)[0];
  return { close: parseFloat(data.result[key].c[0]), timestamp: new Date() };
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

// --- Save price to DB + cache ---
export const savePrice = async (symbol, fetchPriceFn = fetchPrice) => {
  const data = await fetchPriceFn(symbol);
  const price = new Price({ ...data, symbol });
  await price.save();
  prices[symbol] = data.close;
  return price;
};

// --- Get historical prices ---
export const getHistory = async (symbol, period = 24, interval = 60) => {
  const end = new Date();
  const start = new Date(end.getTime() - period * 60 * 60 * 1000);

  let history = await Price.find({ symbol, timestamp: { $gte: start, $lte: end } })
    .sort({ timestamp: 1 })
    .lean();

  // bucket by interval
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
  const rawHistory = await getHistory(symbol, period, 1); // raw per second
  const candles = [];
  let candle = null;

  for (const p of rawHistory) {
    const time = Math.floor(p.time / interval) * interval;
    if (!candle || candle.time !== time) {
      if (candle) candles.push(candle);
      candle = { time, open: p.price, high: p.price, low: p.price, close: p.price };
    } else {
      candle.high = Math.max(candle.high, p.price);
      candle.low = Math.min(candle.low, p.price);
      candle.close = p.price;
    }
  }
  if (candle) candles.push(candle);
  return candles;
};

// --- Get live prices ---
export const getPrices = (symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"]) => {
  if (!Array.isArray(symbols)) symbols = [symbols];
  const result = {};
  symbols.forEach(s => (result[s] = prices[s] || null));
  return result;
};

// --- Start auto price feed ---
export const startPriceFeed = (symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"], intervalMs = 10000, fetchPriceFn = fetchPrice) => {
  if (!Array.isArray(symbols)) symbols = [symbols];

  const updateAll = async () => {
    for (const symbol of symbols) {
      try { await savePrice(symbol, fetchPriceFn); }
      catch(err) { console.error(`[PriceService] Failed to update ${symbol}:`, err.message); }
    }
  };
  updateAll();
  setInterval(updateAll, intervalMs);
};

// --- Export all functions ---
export default {
  fetchPrice,
  savePrice,
  getHistory,
  getPrices,
  startPriceFeed,
  getCandles
};
