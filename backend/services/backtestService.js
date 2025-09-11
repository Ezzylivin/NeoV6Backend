// File: backend/services/backtestService.js

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";
import { fetchHistoricalNews } from "./newsService.js";

/**
 * -----------------------------
 * DEFAULT STRATEGY PARAMETERS (Beginner-friendly descriptions + examples)
 * -----------------------------
 */
export const DEFAULT_STRATEGY_PARAMS = {
  SMA: {
    short: { default: 10, description: "Number of candles for short moving average. Example: 10 means look at last 10 candles.", example: 10 },
    long: { default: 50, description: "Number of candles for long moving average. Example: 50 for smoother trend.", example: 50 },
  },
  EMA: {
    short: { default: 12, description: "Short-term EMA, reacts quickly. Example: 12 periods.", example: 12 },
    long: { default: 26, description: "Long-term EMA, shows overall trend. Example: 26 periods.", example: 26 },
  },
  RSI: {
    period: { default: 14, description: "Candles to calculate RSI. Example: 14 periods.", example: 14 },
    oversold: { default: 30, description: "RSI below this = undervalued, might bounce. Example: 30.", example: 30 },
    overbought: { default: 70, description: "RSI above this = overvalued, might drop. Example: 70.", example: 70 },
  },
  MACD: {
    fast: { default: 12, description: "Fast EMA period. Example: 12.", example: 12 },
    slow: { default: 26, description: "Slow EMA period. Example: 26.", example: 26 },
    signal: { default: 9, description: "Signal line period. Example: 9.", example: 9 },
  },
  BOLLINGERBANDS: {
    period: { default: 20, description: "Number of candles to calculate moving average. Example: 20.", example: 20 },
    multiplier: { default: 2, description: "Controls width of bands. Example: 2.", example: 2 },
  },
  STOCHASTIC: {
    k: { default: 14, description: "Number of candles for %K line. Example: 14.", example: 14 },
  },
  VWAP: {
    period: { default: 20, description: "Candles used for Volume Weighted Average Price. Example: 20.", example: 20 },
  },
  ATR: {
    period: { default: 14, description: "Candles to calculate Average True Range (volatility). Example: 14.", example: 14 },
  },
};

/**
 * -----------------------------
 * INDICATOR HELPERS
 * -----------------------------
 */
const SMA = (arr, period, i) =>
  i < period ? null : arr.slice(i - period, i).reduce((a, b) => a + b, 0) / period;

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

  switch ((name || "").toUpperCase()) {
    case "SMA": {
      const f = SMA(prices, Number(params.short) || 10, i);
      const s = SMA(prices, Number(params.long) || 50, i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "EMA": {
      const f = EMA(prices, Number(params.short) || 12, i);
      const s = EMA(prices, Number(params.long) || 26, i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "RSI": {
      const r = RSI(prices, Number(params.period) || 14, i);
      if (r == null) return null;
      if (r < (params.oversold || 30)) return "BUY";
      if (r > (params.overbought || 70)) return "SELL";
      return null;
    }
    case "MACD": {
      const m = MACD(prices, Number(params.fast) || 12, Number(params.slow) || 26, Number(params.signal) || 9, i);
      return m ? (m.macd > m.sig ? "BUY" : "SELL") : null;
    }
    case "BOLLINGERBANDS": {
      const period = Number(params.period) || 20;
      const mult = Number(params.multiplier) || 2;
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
      const kPeriod = Number(params.k) || 14;
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
      const period = Number(params.period) || 20;
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
      const period = Number(params.period) || 14;
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
 * BACKTEST ENGINE
 * -----------------------------
 */
const EXCHANGES = ["binance", "kraken", "coinbase", "gemini"];
const RISK_SIZES = { Low: 0.25, Medium: 0.5, High: 1 };

async function fetchOHLCVMulti(symbol, timeframe = "1h", limit = 2000) {
  let lastErr;
  for (const ex of EXCHANGES) {
    try {
      const ohlcv = await fetchOHLCV(ex, symbol, timeframe, limit);
      return ohlcv.map(c => ({
        time: new Date(c[0]),
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
        price: c[4],
      }));
    } catch (err) {
      console.warn(`[Backtest] Failed on ${ex} for ${symbol}: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All exchanges failed for ${symbol}: ${lastErr?.message || "unknown"}`);
}

export async function runBacktest({
  userId,
  strategyId = null,
  symbol,
  timeframe = "1h",
  initialBalance = 1000,
  strategy = { name: "SMA", parameters: {} },
  risk = "Medium",
  takeProfit = null,
  stopLoss = null,
  limit = 2000,
  startDate,
  endDate,
  useNews = true,
  tradeConfig = {}
} = {}) {
  const config = { spreadPct: 0.1, slippageBps: 5, newsImpactFactor: 1, randomEventProb: 0.005, ...tradeConfig };

  // Load strategy from DB if strategyId provided
  if (strategyId) {
    const stratDoc = await Strategy.findById(strategyId);
    if (stratDoc) {
      symbol = symbol || stratDoc.params.symbol;
      timeframe = timeframe || stratDoc.params.timeframe;
      initialBalance = initialBalance || stratDoc.params.initialBalance;
      strategy = { name: stratDoc.params.strategyType || "SMA", parameters: stratDoc.params };
      risk = risk || stratDoc.params.risk;
      takeProfit = takeProfit ?? stratDoc.params.takeProfit;
      stopLoss = stopLoss ?? stratDoc.params.stopLoss;
    }
  }

  if (!userId || !symbol || !strategy?.name) throw new Error("Missing required fields");

  let candles = await fetchOHLCVMulti(symbol, timeframe, limit);

  // Date filtering
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    candles = candles.filter(c => (!start || c.time >= start) && (!end || c.time <= end));
  }
  if (!candles.length) return { saved: null, metrics: { netProfit: 0, tradesCount: 0 }, equityCurve: [], trades: [] };

  // Fetch news/events if enabled
  let newsEvents = [];
  if (useNews) {
    try {
      newsEvents = await fetchHistoricalNews(symbol, startDate, endDate);
    } catch (err) {
      console.warn(`[Backtest] Failed to fetch news for ${symbol}: ${err.message}`);
    }
  }

  // Initialize backtest
  let cash = initialBalance, asset = 0, entryPrice = null, openIndex = null, shortAsset = 0, shortEntryPrice = null;
  const trades = [], equityCurve = [];
  const sizeFrac = RISK_SIZES[risk] ?? 0.5;

  for (let i = 1; i < candles.length; i++) {
    let price = applyNewsImpact(candles[i], newsEvents, config.newsImpactFactor);
    if (Math.random() < config.randomEventProb) price *= 1 + (Math.random() - 0.5) * 0.02;
    const decision = executeStrategy(strategy.name, candles, i, strategy.parameters);
    const { buy: priceBuy, sell: priceSell } = applySpread(price, config.spreadPct);

    if (decision === "BUY") {
      const qty = cash * sizeFrac / priceBuy;
      const finalPrice = applySlippage(priceBuy, config.slippageBps);
      cash -= finalPrice * qty;
      asset += qty;
      entryPrice = finalPrice;
      openIndex = i;
      trades.push({ type: "BUY", qty, price: finalPrice, time: candles[i].time });
    } else if (decision === "SELL" && asset > 0) {
      const finalPrice = applySlippage(priceSell, config.slippageBps);
      cash += asset * finalPrice;
      trades.push({ type: "SELL", qty: asset, price: finalPrice, time: candles[i].time });
      asset = 0;
      entryPrice = null;
      openIndex = null;
    }

    equityCurve.push({ time: candles[i].time, equity: cash + asset * price });
  }

  const netProfit = cash + asset * candles[candles.length - 1].price - initialBalance;

  // Save backtest in DB
  const backtestDoc = await Backtest.create({
    userId,
    strategy: strategy.name,
    params: strategy.parameters,
    symbol,
    timeframe,
    initialBalance,
    risk,
    takeProfit,
    stopLoss,
    trades,
    equityCurve,
    netProfit,
    startDate,
    endDate,
  });

  // Logging
  await logToDb(userId, `Backtest executed: ${strategy.name} on ${symbol}, netProfit: ${netProfit.toFixed(2)}`);

  return { saved: backtestDoc, metrics: { netProfit, tradesCount: trades.length }, equityCurve, trades };
}
