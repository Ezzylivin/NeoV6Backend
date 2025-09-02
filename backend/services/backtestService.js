// File: src/backend/services/backtestService.js
// Realistic backtest engine supporting multiple strategies (SMA, EMA, RSI, MACD,
// BollingerBands, Stochastic, VWAP, ATR). Returns saved Backtest doc, metrics,
// equityCurve (array of {time, equity}), and trades.

import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { logToDb } from "./logService.js";

/* ------------------ Utilities & Indicators ------------------ */

const RISK_PCT = {
  low: 0.01, Low: 0.01,
  medium: 0.02, Medium: 0.02,
  high: 0.05, High: 0.05,
};

const TF_PER_YEAR = {
  "1m": 365 * 24 * 60,
  "5m": 365 * 24 * 12,
  "10m": 365 * 24 * 6,
  "15m": 365 * 24 * 4,
  "30m": 365 * 24 * 2,
  "1h": 365 * 24,
  "4h": 365 * 6,
  "1d": 365,
  "3d": 365 / 3,
};

function toCandles(rows) {
  return rows
    .filter(r => r && (r.timestamp != null))
    .map(r => ({
      time: new Date(r.timestamp),
      open: Number(r.open ?? r.price ?? r.close ?? 0),
      high: Number(r.high ?? r.price ?? r.close ?? 0),
      low: Number(r.low ?? r.price ?? r.close ?? 0),
      close: Number(r.close ?? r.price ?? 0),
      volume: Number(r.volume ?? r.v ?? 0),
      raw: r
    }))
    .filter(c => Number.isFinite(c.close));
}

/* Simple moving average */
function SMA(series, period) {
  const out = Array(series.length).fill(null);
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i];
    if (i >= period) sum -= series[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/* Exponential moving average */
function EMA(series, period) {
  const out = Array(series.length).fill(null);
  const k = 2 / (period + 1);
  for (let i = 0; i < series.length; i++) {
    if (i === 0) out[i] = series[i];
    else out[i] = series[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/* RSI (Wilder smoothing) */
function RSI(series, period = 14) {
  const out = Array(series.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < series.length; i++) {
    const diff = series[i] - series[i - 1];
    const g = Math.max(diff, 0);
    const l = Math.max(-diff, 0);
    if (i <= period) {
      gain += g; loss += l;
      if (i === period) {
        const avgGain = gain / period;
        const avgLoss = loss / period;
        const rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
    } else {
      // Wilder smoothing
      gain = (gain * (period - 1) + g) ;
      loss = (loss * (period - 1) + l) ;
      const avgGain = gain / period;
      const avgLoss = loss / period;
      const rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

/* MACD: returns macd line and signal line */
function MACD(series, fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(series, fast);
  const emaSlow = EMA(series, slow);
  const macd = series.map((_, i) => (emaFast[i] != null && emaSlow[i] != null) ? (emaFast[i] - emaSlow[i]) : null);
  // For signal line, replace nulls with 0 to compute ema, then mask
  const macdValid = macd.map(v => v == null ? 0 : v);
  const signalLineFull = EMA(macdValid, signal);
  const signalLine = macd.map((v, i) => (v == null ? null : signalLineFull[i]));
  return { macd, signalLine };
}

/* Bollinger Bands (SMA + width by stddev) */
function Bollinger(series, period = 20, mult = 2) {
  const out = Array(series.length).fill(null).map(_ => ({ middle: null, upper: null, lower: null }));
  for (let i = 0; i < series.length; i++) {
    if (i < period - 1) continue;
    const slice = series.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    out[i] = { middle: mean, upper: mean + mult * sd, lower: mean - mult * sd };
  }
  return out;
}

/* Stochastic oscillator: %K and %D */
function Stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  const k = Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (i < kPeriod - 1) continue;
    const hh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    const ll = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    k[i] = ll === hh ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  // %D is SMA of %K
  const d = SMA(k.map(v => v == null ? 0 : v), dPeriod).map((v, i) => (k[i] == null ? null : v));
  return { k, d };
}

/* VWAP over the series (per-bar cumulative VWAP) */
function VWAP(candles) {
  const out = Array(candles.length).fill(null);
  let cumulPV = 0, cumulVol = 0;
  for (let i = 0; i < candles.length; i++) {
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const vol = candles[i].volume || 0;
    cumulPV += typical * vol;
    cumulVol += vol;
    out[i] = cumulVol === 0 ? null : (cumulPV / cumulVol);
  }
  return out;
}

/* ATR (Average True Range) */
function ATR(candles, period = 14) {
  const out = Array(candles.length).fill(null);
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i];
    if (i >= period) sum -= trs[i - period];
    if (i >= period - 1) out[i + 1] = sum / period;
  }
  return out;
}

/* ------------------ Metrics ------------------ */

function maxDrawdown(equitySeries) {
  if (!equitySeries.length) return 0;
  let peak = equitySeries[0];
  let maxDd = 0;
  for (const v of equitySeries) {
    if (v > peak) peak = v;
    const dd = (peak - v) / (peak || 1);
    if (dd > maxDd) maxDd = dd;
  }
  return +(maxDd * 100).toFixed(2);
}

function profitFactor(trades) {
  let wins = 0, losses = 0;
  for (const t of trades) {
    if (!t || typeof t.profit !== "number") continue;
    if (t.profit > 0) wins += t.profit;
    else losses += Math.abs(t.profit);
  }
  if (losses === 0) return wins > 0 ? Infinity : 0;
  return +(wins / losses).toFixed(2);
}

function sharpeRatio(returns, periodsPerYear = 252, rf = 0) {
  if (!returns || returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const sr = ((mean - rf) * Math.sqrt(periodsPerYear)) / std;
  return +sr.toFixed(2);
}

function cagr(initial, final, startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const years = Math.max((endDate - startDate) / (365 * 24 * 3600 * 1000), 1 / 365);
  const ratio = final / (initial || 1);
  return +((Math.pow(ratio, 1 / years) - 1) * 100).toFixed(2);
}

/* ------------------ Strategy implementations ------------------
   Each strategy returns trades (array), equityCurve (per candle), and simple metrics.
   Trades have: entryTime, entryPrice, exitTime, exitPrice, profit, duration (mins), result
----------------------------------------------------------------*/

function generateEquitySnapshots(candles, cash, qty) {
  return candles.map(c => ({ time: c.time, equity: +(cash + qty * c.close).toFixed(2) }));
}

/* Generic runner helper: given signals (BUY/SELL per bar), do next-bar execution, slippage, fees, risk sizing */
function executeSignalsOnCandles(candles, signals, initialBalance, risk, feeRate = 0.001, slippageBps = 5) {
  const slip = slippageBps / 10000;
  let cash = initialBalance;
  let qty = 0;
  let entryIdx = null;
  const trades = [];
  const equityCurve = [];

  for (let i = 0; i < candles.length - 1; i++) {
    const c = candles[i];
    const next = candles[i + 1]; // execute on next bar open
    // mark equity at current close
    equityCurve.push({ time: c.time, equity: +(cash + qty * c.close).toFixed(2) });

    const sig = signals[i]; // "BUY" | "SELL" | null
    if (sig === "BUY" && cash > 0) {
      const sizePct = RISK_PCT[risk] ?? 0.02;
      const spend = cash * sizePct;
      if (spend <= 0) continue;
      const fill = next.open * (1 + slip);
      const fees = spend * feeRate;
      const purchasedQty = (spend - fees) / fill;
      if (purchasedQty <= 0) continue;
      cash -= spend;
      qty += purchasedQty;
      entryIdx = i + 1;
      trades.push({
        entryTime: next.time,
        entryPrice: +fill.toFixed(8),
        entryFees: +fees.toFixed(8),
        position: "long"
      });
    } else if (sig === "SELL" && qty > 0) {
      const fill = next.open * (1 - slip);
      const gross = qty * fill;
      const fees = gross * feeRate;
      const proceeds = gross - fees;
      const openTrade = trades.slice().reverse().find(t => t.entryTime && !t.exitTime);
      const entryPrice = openTrade?.entryPrice ?? c.close;
      const profit = +(proceeds - (qty * entryPrice)).toFixed(8);
      const duration = entryIdx != null ? Math.round((next.time - candles[entryIdx].time) / 60000) : null;
      cash += proceeds;
      trades.push({
        exitTime: next.time,
        exitPrice: +fill.toFixed(8),
        exitFees: +fees.toFixed(8),
        profit,
        duration,
        position: "long",
        result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven"
      });
      qty = 0;
      entryIdx = null;
    }
  }

  // finalize with last candle
  const last = candles[candles.length - 1];
  equityCurve.push({ time: last.time, equity: +(cash + qty * last.close).toFixed(2) });

  // if still long, close at last.close
  if (qty > 0) {
    const fill = last.close;
    const gross = qty * fill;
    const fees = gross * feeRate;
    const proceeds = gross - fees;
    const openTrade = trades.slice().reverse().find(t => t.entryTime && !t.exitTime);
    const entryPrice = openTrade?.entryPrice ?? last.close;
    const profit = +(proceeds - (qty * entryPrice)).toFixed(8);
    const duration = entryIdx != null ? Math.round((last.time - candles[entryIdx].time) / 60000) : null;
    cash += proceeds;
    trades.push({
      exitTime: last.time,
      exitPrice: +fill.toFixed(8),
      exitFees: +fees.toFixed(8),
      profit,
      duration,
      position: "long",
      result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven"
    });
    qty = 0;
  }

  return { trades: trades.filter(t => typeof t.profit === 'number'), equityCurve };
}

/* Strategy: SMA crossover (fastPeriod/slowPeriod can be provided via parameters) */
function runSMA(candles, params = {}) {
  const closes = candles.map(c => c.close);
  const fast = params.fast || 10;
  const slow = params.slow || 30;
  const smaFast = SMA(closes, fast);
  const smaSlow = SMA(closes, slow);
  const signals = Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    if (smaFast[i - 1] != null && smaSlow[i - 1] != null && smaFast[i] != null && smaSlow[i] != null) {
      if (smaFast[i - 1] < smaSlow[i - 1] && smaFast[i] > smaSlow[i]) signals[i] = "BUY";
      else if (smaFast[i - 1] > smaSlow[i - 1] && smaFast[i] < smaSlow[i]) signals[i] = "SELL";
    }
  }
  return signals;
}

/* Strategy: EMA crossover */
function runEMA(candles, params = {}) {
  const closes = candles.map(c => c.close);
  const fast = params.fast || 12;
  const slow = params.slow || 26;
  const emaFast = EMA(closes, fast);
  const emaSlow = EMA(closes, slow);
  const signals = Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    if (emaFast[i - 1] != null && emaSlow[i - 1] != null && emaFast[i] != null && emaSlow[i] != null) {
      if (emaFast[i - 1] < emaSlow[i - 1] && emaFast[i] > emaSlow[i]) signals[i] = "BUY";
      else if (emaFast[i - 1] > emaSlow[i - 1] && emaFast[i] < emaSlow[i]) signals[i] = "SELL";
    }
  }
  return signals;
}

/* Strategy: RSI mean-reversion */
function runRSI(candles, params = {}) {
  const closes = candles.map(c => c.close);
  const period = params.period || 14;
  const oversold = params.oversold ?? 30;
  const overbought = params.overbought ?? 70;
  const rsi = RSI(closes, period);
  const signals = Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (rsi[i] == null) continue;
    if (rsi[i] < oversold) signals[i] = "BUY";
    else if (rsi[i] > overbought) signals[i] = "SELL";
  }
  return signals;
}

/* Strategy: MACD crossover */
function runMACD(candles, params = {}) {
  const closes = candles.map(c => c.close);
  const fast = params.fast || 12;
  const slow = params.slow || 26;
  const signal = params.signal || 9;
  const { macd, signalLine } = MACD(closes, fast, slow, signal);
  const signals = Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    if (macd[i - 1] != null && signalLine[i - 1] != null && macd[i] != null && signalLine[i] != null) {
      if (macd[i - 1] < signalLine[i - 1] && macd[i] > signalLine[i]) signals[i] = "BUY";
      else if (macd[i - 1] > signalLine[i - 1] && macd[i] < signalLine[i]) signals[i] = "SELL";
    }
  }
  return signals;
}

/* Strategy: Bollinger Bands mean reversion breakout */
function runBollinger(candles, params = {}) {
  const closes = candles.map(c => c.close);
  const period = params.period || 20;
  const mult = params.mult || 2;
  const bands = Bollinger(closes, period, mult);
  const signals = Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    if (!bands[i] || !bands[i - 1]) continue;
    // Enter long when price crosses below lower band (mean reversion)
    if (closes[i - 1] > bands[i - 1].lower && closes[i] < bands[i].lower) signals[i] = "BUY";
    // Exit when price crosses above middle
    else if (closes[i - 1] < bands[i - 1].middle && closes[i] > bands[i].middle) signals[i] = "SELL";
  }
  return signals;
}

/* Strategy: Stochastic oscillator */
function runStochastic(candles, params = {}) {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const kPeriod = params.kPeriod || 14;
  const dPeriod = params.dPeriod || 3;
  const { k, d } = Stochastic(highs, lows, closes, kPeriod, dPeriod);
  const signals = Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    if (k[i - 1] == null || d[i - 1] == null || k[i] == null || d[i] == null) continue;
    if (k[i - 1] < d[i - 1] && k[i] > d[i]) signals[i] = "BUY";
    else if (k[i - 1] > d[i - 1] && k[i] < d[i]) signals[i] = "SELL";
  }
  return signals;
}

/* Strategy: VWAP mean reversion (price crosses VWAP) */
function runVWAPStrategy(candles, params = {}) {
  const vwap = VWAP(candles);
  const closes = candles.map(c => c.close);
  const signals = Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    if (vwap[i - 1] == null || vwap[i] == null) continue;
    if (closes[i - 1] < vwap[i - 1] && closes[i] > vwap[i]) signals[i] = "BUY";
    else if (closes[i - 1] > vwap[i - 1] && closes[i] < vwap[i]) signals[i] = "SELL";
  }
  return signals;
}

/* Strategy: ATR breakout (uses ATR to set entries) - here simplified as cross above ATR multiple */
function runATRStrategy(candles, params = {}) {
  const closes = candles.map(c => c.close);
  const atr = ATR(candles, params.period || 14);
  const signals = Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    if (atr[i] == null || atr[i - 1] == null) continue;
    // a simple rule: if today's close - yesterday's close > ATR -> BUY; if negative less than -ATR -> SELL
    const diff = closes[i] - closes[i - 1];
    if (diff > atr[i]) signals[i] = "BUY";
    else if (diff < -atr[i]) signals[i] = "SELL";
  }
  return signals;
}

/* dispatcher */
function getStrategySignals(name, candles, params = {}) {
  switch ((name || "SMA").toString().toUpperCase()) {
    case "SMA": return runSMA(candles, params);
    case "EMA": return runEMA(candles, params);
    case "RSI": return runRSI(candles, params);
    case "MACD": return runMACD(candles, params);
    case "BOLLINGERBANDS":
    case "BOLLINGER": return runBollinger(candles, params);
    case "STOCHASTIC": return runStochastic(candles, params);
    case "VWAP": return runVWAPStrategy(candles, params);
    case "ATR": return runATRStrategy(candles, params);
    default: throw new Error(`Unknown strategy ${name}`);
  }
}

/* ------------------ Public exported function ------------------ */

/**
 * runRealisticBacktest(options)
 *  - userId: string
 *  - symbol: string
 *  - timeframe: string (not used to fetch different resolution here; assumes price store contains chosen tf)
 *  - initialBalance: number
 *  - strategy: string or { name, parameters }
 *  - risk: 'Low'|'Medium'|'High' (string)
 *  - feeRate, slippageBps optional
 *
 * Returns: { saved, metrics, equityCurve, trades }
 */
export async function runRealisticBacktest({
  userId,
  symbol,
  timeframe = "1h",
  initialBalance = 1000,
  strategy = { name: "SMA", parameters: {} },
  risk = "Medium",
  feeRate = 0.001,
  slippageBps = 5,
  limit = 2000
} = {}) {
  // normalize strategy
  if (!strategy) strategy = { name: "SMA", parameters: {} };
  if (typeof strategy === "string") strategy = { name: strategy, parameters: {} };
  strategy.parameters = strategy.parameters || {};

  // fetch price rows (assumes Price collection contains appropriate tf)
  const rows = await Price.find({ symbol }).sort({ timestamp: 1 }).limit(limit);
  if (!rows || rows.length < 2) {
    // empty result - return empty metrics & don't save
    const emptyMetrics = {
      initialBalance,
      finalBalance: initialBalance,
      netProfit: 0,
      winRate: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      cagr: 0,
      tradesCount: 0
    };
    return { saved: null, metrics: emptyMetrics, equityCurve: [], trades: [] };
  }

  const candles = toCandles(rows);
  const signals = getStrategySignals(strategy.name, candles, strategy.parameters);

  // run execution engine using signals
  const { trades, equityCurve } = executeSignalsOnCandles(candles, signals, initialBalance, risk, feeRate, slippageBps);

  // compute metrics
  const finalBalance = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : initialBalance;
  const netProfit = +(finalBalance - initialBalance).toFixed(2);
  const wins = trades.filter(t => t.profit > 0).length;
  const losses = trades.filter(t => t.profit < 0).length;
  const winRate = trades.length ? +(100 * (wins / (wins + losses || 1))).toFixed(2) : 0;
  const pf = profitFactor(trades);
  const mdd = maxDrawdown(equityCurve.map(p => p.equity));
  // per-bar returns for sharpe
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    const cur = equityCurve[i].equity;
    returns.push(prev === 0 ? 0 : (cur - prev) / prev);
  }
  const sr = sharpeRatio(returns, TF_PER_YEAR[timeframe] ?? 252);
  const firstTime = candles[0].time;
  const lastTime = candles[candles.length - 1].time;
  const cg = cagr(initialBalance, finalBalance, firstTime, lastTime);

  const metrics = {
    initialBalance,
    finalBalance: +finalBalance.toFixed(2),
    netProfit,
    winRate,
    maxDrawdown: mdd,
    profitFactor: pf,
    sharpeRatio: sr,
    cagr: cg,
    tradesCount: trades.length
  };

  // Save to DB
  const saved = await Backtest.create({
    userId,
    symbol,
    timeframe,
    initialBalance,
    finalBalance: metrics.finalBalance,
    profit: metrics.netProfit,
    candlesTested: candles.length,
    strategy: { name: strategy.name, parameters: { ...strategy.parameters } },
    tradeBreakdown: trades,
    metrics,
    risk
  });

  // Log to db
  await logToDb(userId, `[Backtest] ${symbol} ${timeframe} | ${strategy.name} | P/L: $${metrics.netProfit} | Win%: ${metrics.winRate} | MDD: ${metrics.maxDrawdown}%`);

  // normalize equityCurve to {time, equity}
  const eq = equityCurve.map(p => ({ time: p.time, equity: p.equity }));

  return { saved, metrics, equityCurve: eq, trades };
}

export async function runBatchBacktests(userId, exchange = "coinbasepro", paramCombos = []) {
  const results = [];
  for (const params of paramCombos) {
    try {
      const r = await runRealisticBacktest({ userId, ...params });
      results.push({ params, saved: r.saved, metrics: r.metrics, equityCurve: r.equityCurve });
    } catch (err) {
      results.push({ params, saved: null, metrics: { finalBalance: params.initialBalance ?? 0, profit: 0 }, equityCurve: [] });
    }
  }
  // pick best by netProfit
  const best = results.slice().sort((a, b) => (b.metrics?.netProfit ?? 0) - (a.metrics?.netProfit ?? 0))[0] || null;
  return { results, best };
}
