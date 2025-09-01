// File: src/backend/services/priceService.js
import axios from "axios";
import Price from "../dbStructure/price.js";

// === U.S. Exchanges ===
const COINBASE_PRO = "https://api.pro.coinbase.com";
const KRAKEN = "https://api.kraken.com/0/public";
const GEMINI = "https://api.gemini.com/v1";

// === Fetch single live price ===
const fetchFromCoinbase = async (symbol) => {
  const base = symbol.replace("USDT", "USD");
  const { data } = await axios.get(`${COINBASE_PRO}/products/${base}/ticker`);
  return { close: parseFloat(data.price), timestamp: new Date() };
};

const fetchFromGemini = async (symbol) => {
  const base = symbol.replace("USDT", "");
  const { data } = await axios.get(`${GEMINI}/pubticker/${base.toLowerCase()}usd`);
  return { close: parseFloat(data.last), timestamp: new Date() };
};

const fetchFromKraken = async (symbol) => {
  const base = symbol.replace("USDT", "USD");
  const { data } = await axios.get(`${KRAKEN}/Ticker`, { params: { pair: base } });
  const key = Object.keys(data.result)[0];
  return { close: parseFloat(data.result[key].c[0]), timestamp: new Date() };
};

// Try multiple exchanges in order
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

// === Save price to DB ===
export const savePrice = async (symbol) => {
  const data = await fetchPrice(symbol);
  const price = new Price({ ...data, symbol });
  await price.save();
  return price;
};

// === Historical data (candles) ===
export const fetchPriceHistory = async (symbol, periodHours = 24, intervalSec = 60) => {
  const now = Date.now();
  const start = now - periodHours * 3600 * 1000;
  const intervalMinutes = Math.max(intervalSec / 60, 1);

  // 1. Coinbase Pro (best source for OHLC)
  try {
    const res = await axios.get(`${COINBASE_PRO}/products/${symbol}/candles`, {
      params: {
        start: new Date(start).toISOString(),
        end: new Date(now).toISOString(),
        granularity: intervalSec,
      },
    });
    return res.data
      .map(c => ({ time: c[0], open: c[3], high: c[2], low: c[1], close: c[4] }))
      .reverse();
  } catch (err) {
    console.warn(`[History] Coinbase failed for ${symbol}:`, err.message);
  }

  // 2. Kraken fallback
  try {
    const res = await axios.get(`${KRAKEN}/OHLC`, {
      params: { pair: symbol.replace("USDT","USD"), interval: intervalMinutes, since: start / 1000 }
    });
    const key = Object.keys(res.data.result).find(k => k !== "last");
    return res.data.result[key].map(c => ({
      time: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]),
      low: parseFloat(c[3]), close: parseFloat(c[4])
    }));
  } catch (err) {
    console.warn(`[History] Kraken failed for ${symbol}:`, err.message);
  }

  // 3. Gemini fallback (aggregate trades)
  try {
    const res = await axios.get(`${GEMINI}/trades/${symbol.toLowerCase()}usd`);
    const trades = res.data.filter(t => t.timestampms >= start);
    const buckets = {};
    trades.forEach(t => {
      const bucketTime = Math.floor(t.timestampms / 1000 / intervalSec) * intervalSec;
      if (!buckets[bucketTime]) buckets[bucketTime] = [];
      buckets[bucketTime].push(parseFloat(t.price));
    });
    return Object.entries(buckets).map(([time, arr]) => ({
      time: parseInt(time),
      open: arr[0], high: Math.max(...arr), low: Math.min(...arr), close: arr[arr.length-1]
    }));
  } catch (err) {
    console.warn(`[History] Gemini failed for ${symbol}:`, err.message);
  }

  // 4. DB fallback (if exchanges fail)
  const history = await Price.find({ 
    symbol, 
    timestamp: { $gte: new Date(start), $lte: new Date(now) } 
  }).sort({ timestamp: 1 }).lean();

  if (history.length > 0) {
    return history.map(p => ({
      time: new Date(p.timestamp).getTime() / 1000,
      open: p.close, high: p.close, low: p.close, close: p.close
    }));
  }

  return [];
};

// === Live prices for dashboard ===
export const fetchLivePrices = async (symbols) => {
  const prices = {};
  for (const sym of symbols) {
    try {
      const p = await fetchPrice(sym);
      prices[sym] = p.close;
      await savePrice(sym); // store in DB too
    } catch {
      prices[sym] = null;
    }
  }
  return prices;
};

// === Auto updater (background feed) ===
export const startPriceFeed = (symbols = ["BTCUSDT","ETHUSDT"], intervalMs = 10000) => {
  const updateAll = async () => {
    for (const symbol of symbols) {
      try {
        await savePrice(symbol);
      } catch (err) {
        console.error(`[PriceFeed] Failed to update ${symbol}:`, err.message);
      }
    }
  };
  updateAll();
  setInterval(updateAll, intervalMs);
};

export default {
  fetchLivePrices,
  fetchPriceHistory,
  startPriceFeed,
  getCandles,
  getPrices
};

