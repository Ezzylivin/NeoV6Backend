// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import Price from "../dbStructure/price.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";
import { fetchHistoricalNews } from "./newsService.js";

/**
 * -----------------------------
 * DEFAULT STRATEGY PARAMETERS
 * (Aligned with controller)
 * -----------------------------
 */
const DEFAULT_STRATEGY_PARAMS = {
  SMA: { short: 10, long: 50 },
  EMA: { short: 12, long: 26 },
  RSI: { period: 14, oversold: 30, overbought: 70 },
  MACD: { fast: 12, slow: 26, signal: 9 },
  BOLLINGERBANDS: { period: 20, multiplier: 2 },
  STOCHASTIC: { k: 14 },
  VWAP: { period: 20 },
  ATR: { period: 14 }
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

  params = { ...(DEFAULT_STRATEGY_PARAMS[name?.toUpperCase()] || {}), ...params };

  switch ((name || "").toUpperCase()) {
    case "SMA": {
      const f = SMA(prices, Number(params.short), i);
      const s = SMA(prices, Number(params.long), i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "EMA": {
      const f = EMA(prices, Number(params.short), i);
      const s = EMA(prices, Number(params.long), i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "RSI": {
      const r = RSI(prices, Number(params.period), i);
      if (r == null) return null;
      if (r < (params.oversold)) return "BUY";
      if (r > (params.overbought)) return "SELL";
      return null;
    }
    case "MACD": {
      const m = MACD(prices, Number(params.fast), Number(params.slow), Number(params.signal), i);
      return m ? (m.macd > m.sig ? "BUY" : "SELL") : null;
    }
    case "BOLLINGERBANDS": {
      const period = Number(params.period);
      const mult = Number(params.multiplier);
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
      const kPeriod = Number(params.k);
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
      const period = Number(params.period);
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
      const period = Number(params.period);
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

  const prices = await Price.find(query).sort({ timestamp: 1 });
  if (!prices.length) return null;

  return prices.map(p => ({
    time: p.timestamp,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    price: p.close
  }));
}

/**
 * -----------------------------
 * FETCH OHLCV MULTI (U.S. exchanges only)
 * -----------------------------
 */
const EXCHANGES = ["coinbase", "kraken", "gemini"];

async function fetchOHLCVMulti(symbol, timeframe = "1h", limit = 2000, useCache = true, startDate, endDate) {
  if (useCache) {
    const cached = await getCachedOHLCV(symbol, startDate, endDate);
    if (cached && cached.length) return cached;
  }

  let lastErr;
  for (const ex of EXCHANGES) {
    try {
      const ohlcv = await fetchOHLCV(ex, symbol, timeframe, limit, startDate, endDate);

      // save to Price DB
      for (const c of ohlcv) {
        await Price.updateOne(
          { symbol: symbol.toUpperCase(), timestamp: new Date(c[0]) },
          { $set: { open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] } },
          { upsert: true }
        );
      }

      return ohlcv.map(c => ({
        time: new Date(c[0]),
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
        price: c[4]
      }));
    } catch (err) {
      console.warn(`[Backtest] Failed on ${ex} for ${symbol}: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All U.S. exchanges failed for ${symbol}: ${lastErr?.message || "unknown"}`);
}

/**
 * -----------------------------
 * BACKTEST ENGINE
 * -----------------------------
 */
const RISK_SIZES = { Low: 0.25, Medium: 0.5, High: 1 };

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

  if (!userId || !symbol || !strategy?.name) throw new Error("Missing required fields");

  const config = {
    spreadPct: 0.1,
    slippageBps: 5,
    newsImpactFactor: 1,
    randomEventProb: 0.005,
    ...tradeConfig
  };

  // Load strategy from ID if provided
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

  let candles = await fetchOHLCVMulti(symbol, timeframe, limit, true, startDate, endDate);

  // Filter by date
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    candles = candles.filter(c => (!start || c.time >= start) && (!end || c.time <= end));
  }

  if (!candles.length) return { saved: null, metrics: { netProfit: 0, tradesCount: 0 }, equityCurve: [], trades: [] };

  let newsEvents = [];
  if (useNews) {
    try { newsEvents = await fetchHistoricalNews(symbol, startDate, endDate); } 
    catch (err) { console.warn(`[Backtest] Failed to fetch news for ${symbol}: ${err.message}`); }
  }

  let cash = initialBalance, asset = 0, entryPrice = null, openIndex = null, shortAsset = 0, shortEntryPrice = null;
  const trades = [], equityCurve = [];
  const sizeFrac = RISK_SIZES[risk] ?? 0.5;

  for (let i = 1; i < candles.length; i++) {
    let price = applyNewsImpact(candles[i], newsEvents, config.newsImpactFactor);
    if (Math.random() < config.randomEventProb) price *= 1 + (Math.random() * 0.2 - 0.1);
    const { buy: buyPrice, sell: sellPrice } = applySpread(price, config.spreadPct);

    equityCurve.push({ time: candles[i].time, equity: +(cash + asset * price - shortAsset * price).toFixed(2) });

    const decision = executeStrategy(strategy.name, candles, i, strategy.parameters);

    // CLOSE LONG
    if (asset > 0 && entryPrice != null) {
      const pnlPct = ((price - entryPrice) / entryPrice) * 100;
      const exitForRisk = (takeProfit != null && pnlPct >= takeProfit) || (stopLoss != null && pnlPct <= -stopLoss);
      if (exitForRisk || decision === "SELL" || i === candles.length - 1) {
        const fill = applySlippage(sellPrice, config.slippageBps);
        const profit = +(asset * (fill - entryPrice)).toFixed(2);
        trades.push({ entryTime: candles[openIndex].time, exitTime: candles[i].time, entryPrice: +entryPrice.toFixed(2), exitPrice: +fill.toFixed(2), position: "long", profit, duration: i - openIndex, result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven" });
        cash += asset * fill;
        asset = 0;
        entryPrice = null;
        openIndex = null;
      }
    }

    // CLOSE SHORT
    if (shortAsset > 0 && shortEntryPrice != null) {
      const pnlPct = ((shortEntryPrice - price) / shortEntryPrice) * 100;
      const exitForRisk = (takeProfit != null && pnlPct >= takeProfit) || (stopLoss != null && pnlPct <= -stopLoss);
      if (exitForRisk || decision === "BUY" || i === candles.length - 1) {
        const fill = applySlippage(buyPrice, config.slippageBps);
        const profit = +(shortAsset * (shortEntryPrice - fill)).toFixed(2);
        trades.push({ entryTime: candles[openIndex].time, exitTime: candles[i].time, entryPrice: +shortEntryPrice.toFixed(2), exitPrice: +fill.toFixed(2), position: "short", profit, duration: i - openIndex, result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven" });
        cash += profit;
        shortAsset = 0;
        shortEntryPrice = null;
      }
    }

    // OPEN LONG
    if (asset === 0 && decision === "BUY") {
      const spend = cash * sizeFrac;
      if (spend > 0) {
        const fill = applySlippage(buyPrice, config.slippageBps);
        asset = spend / fill;
        cash -= spend;
        entryPrice = fill;
        openIndex = i;
      }
    }

    // OPEN SHORT
    else if (shortAsset === 0 && decision === "SELL") {
      const spend = cash * sizeFrac;
      if (spend > 0) {
        const fill = applySlippage(sellPrice, config.slippageBps);
        shortAsset = spend / fill;
        shortEntryPrice = fill;
        cash -= spend;
        openIndex = i;
      }
    }
  }

  const finalEquity = +(cash + asset * candles[candles.length - 1].price - shortAsset * candles[candles.length - 1].price).toFixed(2);
  equityCurve.push({ time: candles[candles.length - 1].time, equity: finalEquity });

  const netProfit = +(finalEquity - initialBalance).toFixed(2);
  const tradesCount = trades.length;
  const wins = trades.filter(t => t.profit > 0).length;
  const winRate = tradesCount ? +(100 * wins / tradesCount).toFixed(2) : 0;

  let peak = equityCurve[0]?.equity || initialBalance;
  let maxDrawdown = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = (peak - p.equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  maxDrawdown = +(maxDrawdown * 100).toFixed(2);

  const avgReturn = tradesCount ? +(trades.reduce((a, b) => a + b.profit, 0) / tradesCount).toFixed(2) : 0;
  const sharpeRatio = avgReturn ? +(avgReturn / (maxDrawdown || 1)).toFixed(2) : 0;

  const metrics = { netProfit, tradesCount, winRate, maxDrawdown, avgReturn, sharpeRatio };

  const backtest = new Backtest({
    userId,
    strategyId,
    symbol,
    timeframe,
    initialBalance,
    finalEquity,
    risk,
    takeProfit,
    stopLoss,
    strategy,
    metrics,
    trades,
    equityCurve,
    createdAt: new Date()
  });
  await backtest.save();

  await logToDb(userId, `Backtest completed for ${symbol} (${strategy.name}). Net Profit: $${netProfit}`);

  return { saved: backtest, metrics, equityCurve, trades };
}
export const DEFAULT_STRATEGY_PARAMS = {
  SMA: { short: 10, long: 50 },
  EMA: { short: 12, long: 26 },
  RSI: { period: 14, oversold: 30, overbought: 70 },
  MACD: { fast: 12, slow: 26, signal: 9 },
  BOLLINGERBANDS: { period: 20, multiplier: 2 },
  STOCHASTIC: { k: 14 },
  VWAP: { period: 20 },
  ATR: { period: 14 }
};

// Optional alias for legacy imports
export const runRealisticBacktest = runBacktest;
