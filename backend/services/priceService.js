import fetch from "node-fetch";
import Price from "../dbStructure/price.js";

let prices = {}; // in-memory cache

// --- Exchange fetchers ---
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

// --- Save price to DB + cache ---
export const savePrice = async (symbol) => {
  const data = await fetchPrice(symbol);
  const price = new Price({ ...data, symbol });
  await price.save();
  prices[symbol] = data.close;
  return price;
};

// --- Fetch historical prices, downsampled ---
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

// --- Generate candlesticks (OHLC) ---
export const getCandles = async (symbol, period = 24, intervalSec = 60) => {
  const end = new Date();
  const start = new Date(end.getTime() - period * 60 * 60 * 1000);

  const history = await Price.find({
    symbol,
    timestamp: { $gte: start, $lte: end },
  })
    .sort({ timestamp: 1 })
    .lean();

  if (!history.length) return [];

  const candles = [];
  let bucketStart = Math.floor(new Date(history[0].timestamp).getTime() / (intervalSec * 1000)) * (intervalSec * 1000);
  let open = history[0].close, high = history[0].close, low = history[0].close, close = history[0].close;

  for (const p of history) {
    const ts = new Date(p.timestamp).getTime();
    const bucket = Math.floor(ts / (intervalSec * 1000)) * (intervalSec * 1000);

    if (bucket !== bucketStart) {
      candles.push({ time: new Date(bucketStart), open, high, low, close });
      bucketStart = bucket;
      open = high = low = close = p.close;
    } else {
      high = Math.max(high, p.close);
      low = Math.min(low, p.close);
      close = p.close;
    }
  }

  candles.push({ time: new Date(bucketStart), open, high, low, close });
  return candles;
};

// --- Live price cache ---
export const getPrices = (symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"]) => {
  if (!Array.isArray(symbols)) return {};
  const result = {};
  symbols.forEach(s => { result[s] = prices[s] || null; });
  return result;
};

// --- Start auto price feed ---
export const startPriceFeed = (symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"], intervalMs = 10000) => {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    console.error("[PriceService] startPriceFeed received invalid symbols:", symbols);
    symbols = ["BTCUSDT","ETHUSDT","BNBUSDT"];
  }

  const updateAll = async () => {
    await Promise.all(symbols.map(async (s) => {
      try { await savePrice(s); } 
      catch(err) { console.error(`[PriceService] Failed to update ${s}:`, err.message); }
    }));
  };

  console.log("[PriceService] Starting price feed...");
  updateAll();
  setInterval(updateAll, intervalMs);
};

export default { fetchPrice, savePrice, getHistory, getPrices, getCandles, startPriceFeed };
