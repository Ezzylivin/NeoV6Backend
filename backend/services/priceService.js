// File: src/backend/services/priceService.js
import axios from "axios";

// US-based exchanges
const COINBASE_PRO = "https://api.pro.coinbase.com";
const GEMINI = "https://api.gemini.com/v1";
const KRAKEN = "https://api.kraken.com/0/public";

// Helper: retry for Coinbase
const retryAxios = async (url, retries = 2, delayMs = 500) => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await axios.get(url);
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
};

// --- Fetch live prices from multiple exchanges ---
export const fetchLivePrices = async (symbols) => {
  const prices = {};
  for (const sym of symbols) {
    let price = null;

    // Coinbase
    try {
      const res = await retryAxios(`${COINBASE_PRO}/products/${sym}/ticker`);
      price = parseFloat(res.data.price);
    } catch (err) {
      console.warn(`[PriceService] Coinbase failed for ${sym}: ${err.message}`);
    }

    // Gemini fallback
    if (!price) {
      try {
        const res = await axios.get(`${GEMINI}/pubticker/${sym.toLowerCase()}usd`);
        price = parseFloat(res.data.last);
      } catch (err) {
        console.warn(`[PriceService] Gemini failed for ${sym}: ${err.message}`);
      }
    }

    // Kraken fallback
    if (!price) {
      try {
        const pair = sym.replace("USDT", "USD");
        const res = await axios.get(`${KRAKEN}/Ticker`, { params: { pair } });
        const key = Object.keys(res.data.result)[0];
        price = parseFloat(res.data.result[key].c[0]);
      } catch (err) {
        console.warn(`[PriceService] Kraken failed for ${sym}: ${err.message}`);
      }
    }

    prices[sym] = price;
  }
  return prices;
};

// --- Fetch historical candlestick data ---
export const fetchCandles = async (symbol, periodHours, intervalSec) => {
  const now = Date.now();
  const start = now - periodHours * 3600 * 1000;

  // Try Coinbase
  try {
    const res = await axios.get(`${COINBASE_PRO}/products/${symbol}/candles`, {
      params: {
        start: new Date(start).toISOString(),
        end: new Date(now).toISOString(),
        granularity: intervalSec,
      },
    });
    const candles = res.data.map(c => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
    }));
    return { [symbol]: candles.reverse() };
  } catch (err) {
    console.warn(`[PriceService] Coinbase candles failed for ${symbol}: ${err.message}`);
  }

  // Kraken fallback
  try {
    const intervalMinutes = Math.max(intervalSec / 60, 1);
    const pair = symbol.replace("USDT", "USD");
    const res = await axios.get(`${KRAKEN}/OHLC`, { params: { pair, interval: intervalMinutes, since: Math.floor(start / 1000) } });
    const key = Object.keys(res.data.result).find(k => k !== "last");
    const candles = res.data.result[key].map(c => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
    }));
    return { [symbol]: candles };
  } catch (err) {
    console.warn(`[PriceService] Kraken candles failed for ${symbol}: ${err.message}`);
  }

  // Gemini fallback (aggregate trades into buckets)
  try {
    const res = await axios.get(`${GEMINI}/trades/${symbol.toLowerCase()}usd`);
    const trades = res.data.filter(t => t.timestamp * 1000 >= start);
    const buckets = {};
    trades.forEach(t => {
      const bucketTime = Math.floor(t.timestamp / intervalSec) * intervalSec;
      if (!buckets[bucketTime]) buckets[bucketTime] = [];
      buckets[bucketTime].push(parseFloat(t.price));
    });
    const candles = Object.entries(buckets).map(([time, arr]) => {
      const open = arr[0];
      const close = arr[arr.length - 1];
      const high = Math.max(...arr);
      const low = Math.min(...arr);
      return { time: parseInt(time), open, high, low, close };
    });
    return { [symbol]: candles };
  } catch (err) {
    console.warn(`[PriceService] Gemini candles failed for ${symbol}: ${err.message}`);
  }

  return { [symbol]: [] };
};
