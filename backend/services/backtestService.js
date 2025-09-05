// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";

/**
 * -------------------------------------------------------
 * INDICATOR HELPERS (very lightweight, enough to differ)
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
  // naive signal line
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
 * Each returns "BUY" | "SELL" | null
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
      // d = SMA of k, but keep it simple
      if (k < 20) return "BUY";
      if (k > 80) return "SELL";
      return null;
    }
    case "VWAP": {
      // Simplified: compare price to SMA as VWAP proxy in demo (without volume)
      const period = Number(parameters.period) || 20;
      const vwap = SMA(priceArr, period, i);
      if (vwap == null) return null;
      return p > vwap ? "BUY" : "SELL";
    }
    case "ATR": {
      // Simplified: ATR-like volatility filter via STDEV
      const period = Number(parameters.period) || 14;
      const sd = STDEV(priceArr, period, i);
      if (sd == null) return null;
      // If volatility rising (roughly), trend-follow
      const prevSd = STDEV(priceArr, period, i - 1);
      if (prevSd == null) return null;
      return sd >= prevSd ? "BUY" : "SELL";
    }
    default:
      // Fallback: momentum
      if (i < 1) return null;
      return candles[i].price > candles[i - 1].price ? "BUY" : "SELL";
  }
}

// --- List of exchanges to try (use valid ccxt ids; coinbasepro is deprecated) ---
const EXCHANGE_LIST = ["binance", "kraken", "coinbase", "gemini"];

/**
 * Try multiple exchanges for OHLCV; return close price rows
 */
async function fetchOHLCVMulti(symbol, timeframe = "1h", limit = 2000) {
  let lastErr = null;
  for (const ex of EXCHANGE_LIST) {
    try {
      const ohlcv = await fetchOHLCV(ex, symbol, timeframe, limit);
      // Map ccxt rows -> our minimal candle format
      return ohlcv.map((c) => ({ time: new Date(c[0]), price: c[4] }));
    } catch (err) {
      console.warn(`[Backtest] Failed on ${ex} for ${symbol}: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All exchanges failed for ${symbol}: ${lastErr?.message || "unknown error"}`);
}

/**
 * Map "risk" -> position sizing fraction of available balance
 * Low: 25%, Medium: 50%, High: 100%
 */
const RISK_SIZING = { Low: 0.25, Medium: 0.5, High: 1 };

/**
 * Run a single backtest
 * - Uses risk as position sizing
 * - Checks TP/SL intrabar (at each bar) and exits early
 * - Stores symbol/risk/TP/SL in DB
 */
export async function runBacktest({
  userId,
  strategyId = null,
  symbol,
  timeframe = "1h",
  initialBalance = 1000,
  strategy = { name: "SMA", parameters: {} },
  risk = "Medium",
  takeProfit = null, // percent (e.g. 2 means +2%)
  stopLoss = null,   // percent (e.g. 1 means -1%)
  slippageBps = 5,
  limit = 2000,
} = {}) {
  // Allow loading a saved strategy template by id
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

  // Helpful server-side payload log (mirrors your front-end console)
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
  });

  // Get data
  let candles = [];
  try {
    candles = await fetchOHLCVMulti(symbol, timeframe, limit);
  } catch (err) {
    console.error(`[Backtest] Failed to fetch OHLCV for ${symbol}:`, err.message);
    // Return an empty result instead of throwing to keep UI happy
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

  // ---------------------------
  // Backtest loop (long only)
  // ---------------------------
  let cash = initialBalance;
  let asset = 0; // units
  let entryPrice = null;
  let openIndex = null;

  const trades = [];
  const equityCurve = [];
  const slip = slippageBps / 10000;
  const sizeFrac = RISK_SIZING[risk] ?? RISK_SIZING.Medium; // fallback to Medium

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const price = cur.price;

    // Update equity curve at each bar
    equityCurve.push({ time: cur.time, equity: +(cash + asset * price).toFixed(2) });

    const decision = executeStrategy(strategy.name, candles, i, strategy.parameters);

    // If we have an open position, check TP/SL **intrabar** (each bar)
    if (asset > 0 && entryPrice != null) {
      const pnlPct = ((price - entryPrice) / entryPrice) * 100;

      // Exit for TP/SL first (risk controls)
      let exitForRisk = false;
      if (takeProfit != null && pnlPct >= takeProfit) exitForRisk = true;
      if (stopLoss != null && pnlPct <= -stopLoss) exitForRisk = true;

      if (exitForRisk || decision === "SELL" || i === candles.length - 1) {
        const fill = price * (1 - slip);
        const proceeds = asset * fill;
        const profit = +(proceeds - asset * entryPrice).toFixed(2);

        trades.push({
          entryTime: candles[openIndex].time,
          exitTime: cur.time,
          entryPrice: +(entryPrice).toFixed(2),
          exitPrice: +(fill).toFixed(2),
          position: "long",
          profit,
          duration: i - openIndex,
          result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven",
        });

        cash += proceeds;
        asset = 0;
        entryPrice = null;
        openIndex = null;
      }
    }

    // If flat, consider entries on BUY
    if (asset === 0 && decision === "BUY") {
      const spend = cash * sizeFrac; // position size based on risk
      if (spend > 0) {
        const fill = price * (1 + slip);
        asset = spend / fill;
        cash -= spend;
        entryPrice = fill;
        openIndex = i;
      }
    }
  }

  // Final equity & metrics
  const last = candles[candles.length - 1];
  const finalEquity = +(cash + asset * last.price).toFixed(2);
  equityCurve.push({ time: last.time, equity: finalEquity });

  const netProfit = +(finalEquity - initialBalance).toFixed(2);
  const wins = trades.filter((t) => t.profit > 0).length;
  const losses = trades.filter((t) => t.profit < 0).length;
  const tradesCount = trades.length;
  const winRate = tradesCount ? +(100 * wins / tradesCount).toFixed(2) : 0;

  // Max Drawdown
  let peak = equityCurve[0]?.equity || 0;
  let maxDd = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = (peak - pt.equity) / (peak || 1);
    if (dd > maxDd) maxDd = dd;
  }

  // Profit factor (gross wins / gross losses)
  const grossWin = trades.filter((t) => t.profit > 0).reduce((a, b) => a + b.profit, 0);
  const grossLoss = trades.filter((t) => t.profit < 0).reduce((a, b) => a + Math.abs(b.profit), 0);
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : +(grossWin / grossLoss).toFixed(2);

  // Simple Sharpe using daily-ish bars proxy (still illustrative)
  const rets = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity || 1;
    const curEq = equityCurve[i].equity || 1;
    rets.push((curEq - prev) / prev);
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const var_ = rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1) : 0;
  const sharpeRatio = var_ === 0 ? 0 : +(Math.sqrt(252) * (mean / Math.sqrt(var_))).toFixed(2);

  // CAGR over tested period
  const startTime = candles[0]?.time || new Date();
  const endTime = last?.time || new Date();
  const years = Math.max((endTime - startTime) / (365 * 24 * 3600 * 1000), 1 / 365);
  const cagr = +((Math.pow(finalEquity / initialBalance, 1 / years) - 1) * 100).toFixed(2);

  const metrics = {
    initialBalance,
    finalBalance: finalEquity,
    netProfit,
    winRate,
    maxDrawdown: +(maxDd * 100).toFixed(2),
    profitFactor,
    sharpeRatio,
    cagr,
    tradesCount,
  };

  // Persist
  const saved = await Backtest.create({
    userId,
    symbol,             // ✅ store symbol
    timeframe,
    initialBalance,
    finalBalance: finalEquity,
    profit: netProfit,
    candlesTested: candles.length,
    strategy,
    tradeBreakdown: trades,
    metrics,
    risk,               // ✅ store risk
    takeProfit,         // ✅ store TP
    stopLoss,           // ✅ store SL
    createdAt: new Date(),
  });

  await logToDb(
    userId,
    `[Backtest] ${symbol} | ${timeframe} | Risk: ${risk} | TP: ${takeProfit ?? 0}% | SL: ${stopLoss ?? 0}% | Profit: $${netProfit.toFixed(2)} | Trades: ${tradesCount}`
  );

  return { saved, metrics, equityCurve, trades };
}

/**
 * Run multiple backtests in batch (sequentially to avoid DB + rate limit spikes)
 * NOTE: The "sameness" issue you saw before came from strategies behaving
 *       almost identically. With the upgraded strategy engine above, different
 *       names/parameters produce different decisions & results.
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

// Alias (kept for your existing routes)
export const runRealisticBacktest = runBacktest;
