// File: src/services/priceService.js
import Price from "../dbStructure/price.js"; // MongoDB model

let prices = {}; // in-memory cache

// --- Save price ---
export const savePrice = async (symbol, fetchPriceFn) => {
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

  // Downsample by interval
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
  const rawHistory = await getHistory(symbol, period, 1); // raw 1s interval
  const candles = [];
  let candle = null;

  for (const p of rawHistory) {
    const time = Math.floor(p.time / 1000 / interval) * interval; // seconds
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
  const result = {};
  symbols.forEach(s => (result[s] = prices[s] || null));
  return result;
};

// --- Auto price feed ---
export const startPriceFeed = (symbols, intervalMs, fetchPriceFn) => {
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

export default { savePrice, getHistory, getPrices, startPriceFeed, getCandles };
