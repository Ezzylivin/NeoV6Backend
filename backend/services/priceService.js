import Price from "../dbStructure/price.js";
import fetch from "node-fetch";

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

// --- Save price ---
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

  if (interval > 0) {
    const filtered = [];
    let lastTime = 0;
    for (const p of history) {
      const time = new Date(p.timestamp).getTime();
      if (time - lastTime >= interval * 1000) {
        filtered.push({ time, price: p.close });
        lastTime = time;
      }
    }
    history = filtered;
  } else {
    history = history.map(p => ({ time: new Date(p.timestamp).getTime(), price: p.close }));
  }
  return history;
};

// --- Get candlestick data ---
export const getCandles = async (symbol, period = 24, interval = 60) => {
  const rawHistory = await getHistory(symbol, period, 1);
  const candles = [];
  let candle = null;

  for (const p of rawHistory) {
    const time = Math.floor(p.time / 1000 / interval) * interval;
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
export const getPrices = (symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) => {
  if (!Array.isArray(symbols)) symbols = [symbols];
  const result = {};
  symbols.forEach(s => (result[s] = prices[s] || null));
  return result;
};

// --- Auto price feed ---
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
