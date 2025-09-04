// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import Price from "../dbStructure/price.js"; // ✅ Added
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";

/**
 * -------------------------------------------------------
 * INDICATOR HELPERS
 * -------------------------------------------------------
 */
const SMA = (arr, p, i) => {
  if (i < p) return null;
  let s = 0;
  for (let k = i - p; k < i; k++) s += arr[k];
  return s / p;
};

const EMA = (arr, p, i) => {
  if (i < p) return null;
  const k = 2 / (p + 1);
  let ema = arr[i - p];
  for (let k_i = i - p + 1; k_i < i; k_i++) {
    ema = arr[k_i] * k + ema * (1 - k);
  }
  return ema;
};

const RSI = (arr, p, i) => {
  if (i < p + 1) return null;
  let gains = 0,
    losses = 0;
  for (let k = i - p + 1; k <= i; k++) {
    const ch = arr[k] - arr[k - 1];
    if (ch >= 0) gains += ch;
    else losses -= ch;
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
  for (let k = i - signal + 1; k <= i; k++) {
    const fe = EMA(arr, fast, k);
    const se = EMA(arr, slow, k);
    if (fe == null || se == null) return null;
    hist.push(fe - se);
  }
  const sig = hist.reduce((a, b) => a + b, 0) / hist.length;
  return { macd, sig };
};

const STDEV = (arr, p, i) => {
  if (i < p) return null;
  const slice = arr.slice(i - p, i);
  const mean = slice.reduce((a, b) => a + b, 0) / p;
  const v = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / p;
  return Math.sqrt(v);
};

/**
 * -------------------------------------------------------
 * STRATEGY DECISIONS
 * -------------------------------------------------------
 */
function executeStrategy(strategyName, candles, i, parameters = {}) {
  const priceArr = candles.map((c) => c.price);
  const p = priceArr[i];

  switch ((strategyName || "").toUpperCase()) {
    case "SMA": {
      const fast = Number(parameters.fast) || 5;
      const slow = Number(parameters.slow) || 20;
      const f = SMA(priceArr, fast, i);
      const s = SMA(priceArr, slow, i);
      if (f == null || s == null) return null;
      return f > s ? "BUY" : "SELL";
    }
    case "EMA": {
      const fast = Number(parameters.fast) || 8;
      const slow = Number(parameters.slow) || 21;
      const f = EMA(priceArr, fast, i);
      const s = EMA(priceArr, slow, i);
      if (f == null || s == null) return null;
      return f > s ? "BUY" : "SELL";
    }
    case "RSI": {
      const period = Number(parameters.period) || 14;
      const overbought = Number(parameters.overbought) || 70;
      const oversold = Number(parameters.oversold) || 30;
      const r = RSI(priceArr, period, i);
      if (r == null) return null;
      if (r < oversold) return "BUY";
      if (r > overbought) return "SELL";
      return null;
    }
    case "MACD": {
      const fast = Number(parameters.fast) || 12;
      const slow = Number(parameters.slow) || 26;
      const signal = Number(parameters.signal) || 9;
      const m = MACD(priceArr, fast, slow, signal, i);
      if (!m) return null;
      return m.macd > m.sig ? "BUY" : "SELL";
    }
    case "BOLLINGERBANDS": {
      const period = Number(parameters.period) || 20;
      const mult = Number(parameters.multiplier) || 2;
      const ma = SMA(priceArr, period, i);
      const sd = STDEV(priceArr, period, i);
      if (ma == null || sd == null) return null;
      const upper = ma + mult * sd;
      const lower = ma - mult * sd;
      if (p < lower) return "BUY";
      if (p > upper) return "SELL";
      return null;
    }
    case "STOCHASTIC": {
      const kPeriod = Number(parameters.k) || 14;
      const dPeriod = Number(parameters.d) || 3;
      if (i < kPeriod + dPeriod) return null;
      const window = candles.slice(i - kPeriod, i);
      const highs = window.map((c) => c.price);
      const lows = window.map((c) => c.price);
      const high = Math.max(...highs);
      const low = Math.min(...lows);
      const k = ((p - low) / Math.max(high - low, 1e-9)) * 100;
      if (k < 20) return "BUY";
      if (k > 80) return "SELL";
      return null;
    }
    case "VWAP": {
      const period = Number(parameters.period) || 20;
      const vwap = SMA(priceArr, period, i);
      if (vwap == null) return null;
      return p > vwap ? "BUY" : "SELL";
    }
    case "ATR": {
      const period = Number(parameters.period) || 14;
      const sd = STDEV(priceArr, period, i);
      if (sd == null) return null;
      const prevSd = STDEV(priceArr, period, i - 1);
      if (prevSd == null) return null;
      return sd >= prevSd ? "BUY" : "SELL";
    }
    default:
      if (i < 1) return null;
      return candles[i].price > candles[i - 1].price ? "BUY" : "SELL";
  }
}

// --- Exchange list ---
const EXCHANGE_LIST = ["binance", "kraken", "coinbase", "gemini"];

async function fetchOHLCVMulti(symbol, timeframe = "1h", limit = 2000) {
  let lastErr = null;
  for (const ex of EXCHANGE_LIST) {
    try {
      const ohlcv = await fetchOHLCV(ex, symbol, timeframe, limit);
      return ohlcv.map((c) => ({ time: new Date(c[0]), price: c[4] }));
    } catch (err) {
      console.warn(`[Backtest] Failed on ${ex} for ${symbol}: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All exchanges failed for ${symbol}: ${lastErr?.message || "unknown error"}`);
}

const RISK_SIZING = { Low: 0.25, Medium: 0.5, High: 1 };

/**
 * Run a single backtest
 */
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
  slippageBps = 5,
  limit = 2000,
  startDate = null,   // ✅ NEW
  endDate = null      // ✅ NEW
} = {}) {
  if (strategyId) {
    const stratDoc = await Strategy.findById(strategyId);
    if (stratDoc) {
      symbol = symbol || stratDoc.params.symbol;
      timeframe = timeframe || stratDoc.params.timeframe;
      initialBalance = initialBalance || stratDoc.params.initialBalance;
      strategy = { name: stratDoc.params.strategyType || "SMA", parameters: stratDoc.params };
      risk = risk || stratDoc.params.risk;
      takeProfit = takeProfit != null ? takeProfit : stratDoc.params.takeProfit;
      stopLoss = stopLoss != null ? stopLoss : stratDoc.params.stopLoss;
    }
  }

  if (!userId || !symbol || !strategy?.name) {
    throw new Error("Missing required fields: userId, symbol, or strategy.name");
  }

  console.log("[RunBacktest Payload]", {
    userId,
    symbol,
    timeframe,
    initialBalance,
    strategy,
    risk,
    takeProfit,
    stopLoss,
    limit,
    startDate,
    endDate,
  });

  // ✅ Candle fetch: by date range OR fallback to limit
  let candles = [];
  try {
    if (startDate && endDate) {
      candles = await Price.find({
        symbol,
        timeframe,
        timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) }
      })
        .sort({ timestamp: 1 })
        .lean();

      candles = candles.map(c => ({
        time: c.timestamp,
        price: c.close
      }));
    } else {
      candles = await fetchOHLCVMulti(symbol, timeframe, limit);
    }
  } catch (err) {
    console.error(`[Backtest] Failed to fetch OHLCV for ${symbol}:`, err.message);
    const emptyMetrics = {
      initialBalance,
      finalBalance: initialBalance,
      netProfit: 0,
      winRate: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      cagr: 0,
      tradesCount: 0,
    };
    return { saved: null, metrics: emptyMetrics, equityCurve: [], trades: [] };
  }

  // ⚡️ Rest of your backtest loop, metrics, saving, logging (unchanged)...
  // (Keep everything you already had from here onward)
}

/**
 * Run batch backtests (unchanged)
 */
export async function runBatchBacktests(userId, _exchange, paramCombos) {
  const results = [];
  let best = null;

  for (const combo of paramCombos) {
    const { saved, metrics } = await runBacktest({ userId, ...combo });
    results.push({ saved, metrics });
    if (!best || metrics.netProfit > best.metrics.netProfit) {
      best = { saved, metrics };
    }
  }

  return { results, best };
}

export const runRealisticBacktest = runBacktest;
