// File: backend/services/backtestService.js

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import Price from "../dbStructure/price.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";
import { fetchHistoricalNews } from "./newsService.js";

/**
 * -----------------------------
 * USER-FRIENDLY STRATEGY PARAMETERS
 * -----------------------------
 */
export const STRATEGY_PARAMS_DESCRIPTION = {
  SMA: {
    fast: {
      default: 5,
      description: "The short-term period for the Simple Moving Average. Helps detect quick trend changes. Example: 5 means averaging the last 5 candles.",
      min: 1,
      max: 50
    },
    slow: {
      default: 20,
      description: "The long-term period for the Simple Moving Average. Helps detect the overall trend. Example: 20 means averaging the last 20 candles.",
      min: 5,
      max: 200
    }
  },
  EMA: {
    fast: {
      default: 8,
      description: "The short-term period for the Exponential Moving Average. EMA reacts faster to recent price changes than SMA. Example: 8",
      min: 1,
      max: 50
    },
    slow: {
      default: 21,
      description: "The long-term period for the Exponential Moving Average. Provides a smoother trend detection. Example: 21",
      min: 5,
      max: 200
    }
  },
  RSI: {
    period: {
      default: 14,
      description: "The number of candles to calculate the Relative Strength Index (RSI). Example: 14",
      min: 5,
      max: 50
    },
    oversold: {
      default: 30,
      description: "The RSI level below which the asset is considered oversold and might be a BUY opportunity. Example: 30",
      min: 0,
      max: 50
    },
    overbought: {
      default: 70,
      description: "The RSI level above which the asset is considered overbought and might be a SELL opportunity. Example: 70",
      min: 50,
      max: 100
    }
  },
  MACD: {
    fast: {
      default: 12,
      description: "The fast EMA period used in MACD calculation. Detects short-term momentum. Example: 12",
      min: 5,
      max: 50
    },
    slow: {
      default: 26,
      description: "The slow EMA period used in MACD calculation. Detects long-term momentum. Example: 26",
      min: 10,
      max: 100
    },
    signal: {
      default: 9,
      description: "The signal line period for MACD, used to generate buy/sell signals. Example: 9",
      min: 1,
      max: 50
    }
  },
  BOLLINGERBANDS: {
    period: {
      default: 20,
      description: "The period for calculating the moving average for Bollinger Bands. Example: 20",
      min: 5,
      max: 100
    },
    multiplier: {
      default: 2,
      description: "Number of standard deviations to calculate upper and lower bands. Example: 2",
      min: 1,
      max: 5
    }
  },
  STOCHASTIC: {
    k: {
      default: 14,
      description: "Number of periods to calculate the %K line of the Stochastic Oscillator. Example: 14",
      min: 5,
      max: 50
    }
  },
  VWAP: {
    period: {
      default: 20,
      description: "Number of candles used to calculate the Volume Weighted Average Price. Example: 20",
      min: 5,
      max: 100
    }
  },
  ATR: {
    period: {
      default: 14,
      description: "Number of periods used to calculate the Average True Range (ATR), which measures market volatility. Example: 14",
      min: 5,
      max: 50
    }
  }
};

/**
 * -----------------------------
 * INDICATOR HELPERS
 * -----------------------------
 */
const SMA = (arr, period, i) => i < period ? null : arr.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
const EMA = (arr, period, i) => {
  if (i < period) return null;
  const k = 2 / (period + 1);
  let ema = arr[i - period];
  for (let idx = i - period + 1; idx < i; idx++) {
    ema = arr[idx] * k + ema * (1 - k);
  }
  return ema;
};
const RSI = (arr, period, i) => {
  if (i < period + 1) return null;
  let gains = 0, losses = 0;
  for (let idx = i - period + 1; idx <= i; idx++) {
    const change = arr[idx] - arr[idx - 1];
    if (change > 0) gains += change;
    else losses += -change;
  }
  const rs = losses === 0 ? 100 : gains / (losses || 1e-9);
  return 100 - 100 / (1 + rs);
};
const MACD = (arr, fast = 12, slow = 26, signal = 9, i) => {
  if (i < slow + signal) return null;
  const fastE = EMA(arr, fast, i);
  const slowE = EMA(arr, slow, i);
  if (fastE == null || slowE == null) return null;
  const macd = fastE - slowE;
  const hist = [];
  for (let idx = i - signal + 1; idx <= i; idx++) {
    const fe = EMA(arr, fast, idx);
    const se = EMA(arr, slow, idx);
    if (fe == null || se == null) return null;
    hist.push(fe - se);
  }
  const sig = hist.reduce((a, b) => a + b, 0) / hist.length;
  return { macd, sig };
};
const STDEV = (arr, period, i) => {
  if (i < period) return null;
  const slice = arr.slice(i - period, i);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  return Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
};

/**
 * -----------------------------
 * STRATEGY EXECUTION
 * -----------------------------
 */
function executeStrategy(name, candles, i, params = {}) {
  const prices = candles.map(c => c.price);
  const price = prices[i];
  params = { ...(STRATEGY_PARAMS_DESCRIPTION[name?.toUpperCase()] || {}), ...params };

  switch ((name || "").toUpperCase()) {
    case "SMA": {
      const f = SMA(prices, Number(params.fast?.default || 5), i);
      const s = SMA(prices, Number(params.slow?.default || 20), i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "EMA": {
      const f = EMA(prices, Number(params.fast?.default || 8), i);
      const s = EMA(prices, Number(params.slow?.default || 21), i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "RSI": {
      const r = RSI(prices, Number(params.period?.default || 14), i);
      if (r == null) return null;
      if (r < (params.oversold?.default ?? 30)) return "BUY";
      if (r > (params.overbought?.default ?? 70)) return "SELL";
      return null;
    }
    case "MACD": {
      const m = MACD(prices, Number(params.fast?.default || 12), Number(params.slow?.default || 26), Number(params.signal?.default || 9), i);
      return m ? (m.macd > m.sig ? "BUY" : "SELL") : null;
    }
    case "BOLLINGERBANDS": {
      const period = Number(params.period?.default ?? 20);
      const mult = Number(params.multiplier?.default ?? 2);
      const ma = SMA(prices, period, i);
      const sd = STDEV(prices, period, i);
      if (ma == null || sd == null) return null;
      const upper = ma + mult * sd;
      const lower = ma - mult * sd;
      if (price < lower) return "BUY";
      if (price > upper) return "SELL";
      return null;
    }
    case "STOCHASTIC": {
      const kPeriod = Number(params.k?.default ?? 14);
      if (i < kPeriod) return null;
      const window = candles.slice(i - kPeriod, i);
      const high = Math.max(...window.map(c => c.high));
      const low = Math.min(...window.map(c => c.low));
      const k = ((candles[i].close - low) / Math.max(high - low, 1e-9)) * 100;
      if (k < 20) return "BUY";
      if (k > 80) return "SELL";
      return null;
    }
    case "VWAP": {
      let cumPV = 0, cumVol = 0;
      const period = Number(params.period?.default ?? 20);
      for (let j = Math.max(0, i - period + 1); j <= i; j++) {
        const typicalPrice = (candles[j].high + candles[j].low + candles[j].close) / 3;
        cumPV += typicalPrice * (candles[j].volume || 1);
        cumVol += (candles[j].volume || 1);
      }
      if (cumVol === 0) return null;
      const vwap = cumPV / cumVol;
      return price > vwap ? "BUY" : "SELL";
    }
    case "ATR": {
      const period = Number(params.period?.default ?? 14);
      if (i < period) return null;
      const trs = [];
      for (let j = i - period + 1; j <= i; j++) {
        const prevClose = candles[j - 1]?.close ?? candles[j].close;
        const tr = Math.max(
          candles[j].high - candles[j].low,
          Math.abs(candles[j].high - prevClose),
          Math.abs(candles[j].low - prevClose)
        );
        trs.push(tr);
      }
      const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
      const prevAtr = trs.length > 1 ? trs.slice(0, -1).reduce((a, b) => a + b, 0) / (trs.length - 1) : atr;
      return atr >= prevAtr ? "BUY" : "SELL";
    }
    default:
      if (i < 1) return null;
      return price > prices[i - 1] ? "BUY" : "SELL";
  }
}

/**
 * -----------------------------
 * REALISM HELPERS
 * -----------------------------
 */
function applySpread(price, spreadPct) {
  const spread = spreadPct / 100;
  return { buy: price * (1 + spread), sell: price * (1 - spread) };
}

function applySlippage(price, slippageBps) {
  const factor = 0.5 + Math.random();
  return price * (1 + slippageBps / 10000 * factor);
}

function applyNewsImpact(candle, newsEvents, newsImpactFactor = 1) {
  if (!newsEvents || !newsEvents.length) return candle.price;
  const relevant = newsEvents.filter(n => Math.abs(new Date(n.time) - candle.time) < 60 * 60 * 1000);
  let price = candle.price;
  for (const n of relevant) price *= 1 + (n.impact || 0) * newsImpactFactor;
  return price;
}

/**
 * -----------------------------
 * FETCH CACHED OHLCV
 * -----------------------------
 */
async function getCachedOHLCV(symbol, startDate, endDate) {
  const query = { symbol: symbol.toUpperCase() };
  if (startDate || endDate) query.timestamp = {};
  if (startDate) query.timestamp.$gte = new Date(startDate);
  if (endDate) query.timestamp.$lte = new Date(endDate);

  const cached = await Price.find(query).sort({ timestamp: 1 }).lean();
  if (!cached.length) return fetchOHLCV(symbol, startDate, endDate);
  return cached;
}

/**
 * -----------------------------
 * RUN SINGLE BACKTEST
 * -----------------------------
 */
export async function runBacktest(symbol, strategyName, strategyParams, startDate, endDate) {
  const candles = await getCachedOHLCV(symbol, startDate, endDate);
  const news = await fetchHistoricalNews(symbol, startDate, endDate);

  let balance = 10000, position = 0;
  const trades = [];
  for (let i = 0; i < candles.length; i++) {
    let price = applyNewsImpact(candles[i], news);
    price = applySpread(price, 0.05);
    price = applySlippage(price, 5);

    const signal = executeStrategy(strategyName, candles, i, strategyParams);
    if (signal === "BUY" && balance > 0) {
      position = balance / price;
      balance = 0;
      trades.push({ time: candles[i].timestamp, action: "BUY", price });
    } else if (signal === "SELL" && position > 0) {
      balance = position * price;
      position = 0;
      trades.push({ time: candles[i].timestamp, action: "SELL", price });
    }
  }
  if (position > 0) balance = position * candles[candles.length - 1].close;
  return { finalBalance: balance, trades };
}

/**
 * -----------------------------
 * RUN BATCH BACKTESTS
 * -----------------------------
 */
export async function runBatchBacktests(symbol, strategyConfigs, startDate, endDate) {
  const results = [];
  for (const config of strategyConfigs) {
    const res = await runBacktest(symbol, config.name, config.params, startDate, endDate);
    results.push({ ...config, ...res });
  }
  return results;
}
