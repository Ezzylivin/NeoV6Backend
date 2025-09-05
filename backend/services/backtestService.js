import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";

const SMA = (arr, period, i) =>
  i < period ? null : arr.slice(i - period, i).reduce((a, b) => a + b, 0) / period;

const EMA = (arr, period, i) => {
  if (i < period) return null;
  const k = 2 / (period + 1);
  let ema = SMA(arr, period, i); // initialize EMA with SMA
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
    else losses += -change; // fixed
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
  for (let idx = Math.max(i - signal + 1, slow); idx <= i; idx++) {
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

function executeStrategy(name, candles, i, params = {}) {
  const prices = candles.map(c => c.price);
  const price = prices[i];
  const strategy = (name || "").toUpperCase();

  switch (strategy) {
    case "SMA": {
      const f = SMA(prices, Number(params.fast) || 5, i);
      const s = SMA(prices, Number(params.slow) || 20, i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "EMA": {
      const f = EMA(prices, Number(params.fast) || 8, i);
      const s = EMA(prices, Number(params.slow) || 21, i);
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
      const dPeriod = Number(params.d) || 3;
      if (i < kPeriod + dPeriod) return null;
      const window = candles.slice(i - kPeriod, i);
      const high = Math.max(...window.map(c => c.price));
      const low = Math.min(...window.map(c => c.price));
      const k = ((price - low) / Math.max(high - low, 1e-9)) * 100;
      if (k < 20) return "BUY";
      if (k > 80) return "SELL";
      return null;
    }
    case "VWAP": {
      const vwap = SMA(prices, Number(params.period) || 20, i);
      return vwap != null ? (price > vwap ? "BUY" : "SELL") : null;
    }
    case "ATR": {
      const sd = STDEV(prices, Number(params.period) || 14, i);
      const prevSd = STDEV(prices, Number(params.period) || 14, i - 1);
      return sd != null && prevSd != null ? (sd >= prevSd ? "BUY" : "SELL") : null;
    }
    default:
      if (i < 1) return null;
      return price > prices[i - 1] ? "BUY" : "SELL";
  }
}

const EXCHANGES = ["binance", "kraken", "coinbase", "gemini"];
const RISK_SIZES = { Low: 0.25, Medium: 0.5, High: 1 };

async function fetchOHLCVMulti(symbol, timeframe = "1h", limit = 2000) {
  let lastErr;
  for (const ex of EXCHANGES) {
    try {
      const ohlcv = await fetchOHLCV(ex, symbol, timeframe, limit);
      return ohlcv.map(c => ({ time: new Date(c[0]), price: c[4] }));
    } catch (err) {
      console.warn(`[Backtest] Failed on ${ex} for ${symbol}: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All exchanges failed for ${symbol}: ${lastErr?.message || "unknown"}`);
}

export async function runBacktest({
  userId, strategyId = null, symbol, timeframe = "1h",
  initialBalance = 1000, strategy = { name: "SMA", parameters: {} },
  risk = "Medium", takeProfit = null, stopLoss = null, slippageBps = 5,
  limit = 2000, startDate, endDate
} = {}) {
  if (strategyId) {
    const stratDoc = await Strategy.findById(strategyId);
    if (stratDoc) {
      symbol = symbol || stratDoc.params.symbol;
      timeframe = timeframe || stratDoc.params.timeframe;
      initialBalance = initialBalance || stratDoc.params.initialBalance;
      strategy = { name: stratDoc.params.strategyType?.toUpperCase() || "SMA", parameters: stratDoc.params };
      risk = risk || stratDoc.params.risk;
      takeProfit = takeProfit ?? stratDoc.params.takeProfit;
      stopLoss = stopLoss ?? stratDoc.params.stopLoss;
    }
  }

  if (!userId || !symbol || !strategy?.name) throw new Error("Missing required fields");

  let candles;
  try { candles = await fetchOHLCVMulti(symbol, timeframe, limit); } 
  catch (err) { 
    console.error(`[Backtest] Failed OHLCV:`, err.message);
    return { saved: null, metrics: { netProfit: 0, tradesCount: 0 }, equityCurve: [], trades: [] };
  }

  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    candles = candles.filter(c => {
      const t = new Date(c.time);
      return (!start || t >= start) && (!end || t <= end);
    });
  }

  if (!candles.length) return { saved: null, metrics: { netProfit: 0, tradesCount: 0 }, equityCurve: [], trades: [] };

  let cash = initialBalance, asset = 0, entryPrice = null, openIndex = null;
  const trades = [], equityCurve = [];
  const slip = slippageBps / 10000;
  const sizeFrac = RISK_SIZES[risk] ?? 0.5;

  for (let i = 1; i < candles.length; i++) {
    const price = candles[i].price;
    equityCurve.push({ time: candles[i].time, equity: +(cash + asset * price).toFixed(2) });
    const decision = executeStrategy(strategy.name, candles, i, strategy.parameters);

    if (asset > 0 && entryPrice != null) {
      const pnlPct = ((price - entryPrice) / entryPrice) * 100;
      const exitForRisk = (takeProfit != null && pnlPct >= takeProfit) || (stopLoss != null && pnlPct <= -stopLoss);
      if (exitForRisk || decision === "SELL" || i === candles.length - 1) {
        const fill = price * (1 - slip);
        const profit = +(asset * (fill - entryPrice)).toFixed(2);
        trades.push({
          entryTime: candles[openIndex].time,
          exitTime: candles[i].time,
          entryPrice: +entryPrice.toFixed(2),
          exitPrice: +fill.toFixed(2),
          position: "long",
          profit,
          duration: i - openIndex,
          result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven"
        });
        cash += asset * fill;
        asset = 0;
        entryPrice = null;
        openIndex = null;
      }
    }

    if (asset === 0 && decision === "BUY") {
      const spend = cash * sizeFrac;
      if (spend > 0) {
        const fill = price * (1 + slip);
        asset = spend / fill;
        cash -= spend;
        entryPrice = fill;
        openIndex = i;
      }
    }
  }

  const finalEquity = +(cash + asset * candles[candles.length - 1].price).toFixed(2);
  equityCurve.push({ time: candles[candles.length - 1].time, equity: finalEquity });

  const netProfit = +(finalEquity - initialBalance).toFixed(2);
  const tradesCount = trades.length;
  const wins = trades.filter(t => t.profit > 0).length;
  const winRate = tradesCount ? +(100 * wins / tradesCount).toFixed(2) : 0;
  let peak = equityCurve[0]?.equity || 0, maxDd = 0;
  for (const pt of equityCurve) { peak = Math.max(peak, pt.equity); maxDd = Math.max(maxDd, (peak - pt.equity) / (peak || 1)); }
  const grossWin = trades.filter(t => t.profit > 0).reduce((a, b) => a + b.profit, 0);
  const grossLoss = trades.filter(t => t.profit < 0).reduce((a, b) => a + Math.abs(b.profit), 0);
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : +(grossWin / grossLoss).toFixed(2);
  const rets = equityCurve.slice(1).map((p, i) => (p.equity - equityCurve[i].equity) / equityCurve[i].equity);
  const avgRet = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const stdRet = Math.sqrt(rets.reduce((a, b) => a + b ** 2, 0) / (rets.length || 1) - avgRet ** 2) || 1e-9;
  const sharpe = +(Math.sqrt(252) * avgRet / stdRet).toFixed(2);

  const saved = await Backtest.create({
    userId, symbol, timeframe, strategy,
    initialBalance, finalBalance: finalEquity,
    risk, takeProfit, stopLoss, trades, equityCurve, metrics: { netProfit, tradesCount, winRate, maxDrawdown: +(maxDd * 100).toFixed(2), profitFactor, sharpe }
  });

  await logToDb(userId, `Backtest saved: ${symbol} ${strategy.name} (${tradesCount} trades)`);

  return { saved, trades, equityCurve, metrics: saved.metrics };
}

export const runRealisticBacktest = runBacktest;
