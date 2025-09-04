// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import Price from "../dbStructure/price.js"; // ✅ Needed for date-range queries
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
  let gains = 0, losses = 0;
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
  const priceArr = candles.map(c => c.price);
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
      const highs = window.map(c => c.price);
      const lows = window.map(c => c.price);
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
      return priceArr[i] > priceArr[i - 1] ? "BUY" : "SELL";
  }
}

// --- Exchange list ---
const EXCHANGE_LIST = ["binance", "kraken", "coinbase", "gemini"];

async function fetchOHLCVMulti(symbol, timeframe = "1h", limit = 2000) {
  let lastErr = null;
  for (const ex of EXCHANGE_LIST) {
    try {
      const ohlcv = await fetchOHLCV(ex, symbol, timeframe, limit);
      return ohlcv.map(c => ({ time: new Date(c[0]), price: c[4] }));
    } catch (err) {
      console.warn(`[Backtest] Failed on ${ex} for ${symbol}: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All exchanges failed for ${symbol}: ${lastErr?.message || "unknown error"}`);
}

const RISK_SIZING = { Low: 0.25, Medium: 0.5, High: 1 };

/**
 * Run single backtest
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
  startDate = null,
  endDate = null
} = {}) {
  // Load strategy template if given
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
    userId, symbol, timeframe, initialBalance, strategy, risk, takeProfit, stopLoss, limit, startDate, endDate
  });

  // ---------------------------
  // Fetch candles with safety
  // ---------------------------
  let candles = [];
  try {
    if (startDate && endDate) {
      candles = await Price.find({
        symbol,
        timeframe,
        timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }).sort({ timestamp: 1 }).lean();

      candles = candles.map(c => ({ time: c.timestamp, price: c.close }))
                       .filter(c => c.price != null);
    } else {
      candles = await fetchOHLCVMulti(symbol, timeframe, limit);
      candles = candles.filter(c => c.price != null);
    }

    if (!candles.length) {
      console.warn(`[Backtest] No candle data for ${symbol} ${timeframe} ${startDate ?? ""} - ${endDate ?? ""}`);
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
      tradesCount: 0
    };
    return { saved: null, metrics: emptyMetrics, equityCurve: [], trades: [] };
  }

  // ---------------------------
  // Backtest loop
  // ---------------------------
  let cash = initialBalance;
  let asset = 0;
  let entryPrice = null;
  let openIndex = null;

  const trades = [];
  const equityCurve = [];
  const slip = slippageBps / 10000;
  const sizeFrac = RISK_SIZING[risk] ?? RISK_SIZING.Medium;

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const price = cur.price;
    equityCurve.push({ time: cur.time, equity: +(cash + asset * price).toFixed(2) });

    const decision = executeStrategy(strategy.name, candles, i, strategy.parameters);

    // Close positions if needed
    if (asset > 0 && entryPrice != null) {
      const pnlPct = ((price - entryPrice) / entryPrice) * 100;
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
          entryPrice: +entryPrice.toFixed(2),
          exitPrice: +fill.toFixed(2),
          position: "long",
          profit,
          duration: i - openIndex,
          result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven"
        });

        cash += proceeds;
        asset = 0;
        entryPrice = null;
        openIndex = null;
      }
    }

    // Open position
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

  // Final equity & metrics
  const last = candles[candles.length - 1];
  const finalEquity = +(cash + asset * last.price).toFixed(2);
  equityCurve.push({ time: last.time, equity: finalEquity });

  const netProfit = +(finalEquity - initialBalance).toFixed(2);
  const wins = trades.filter(t => t.profit > 0).length;
  const tradesCount = trades.length;
  const winRate = tradesCount ? +(100 * wins / tradesCount).toFixed(2) : 0;

  // Max drawdown
  let peak = equityCurve[0]?.equity || 0;
  let maxDd = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = (peak - pt.equity) / (peak || 1);
    if (dd > maxDd) maxDd = dd;
  }

  const grossWin = trades.filter(t => t.profit > 0).reduce((a, b) => a + b.profit, 0);
  const grossLoss = trades.filter(t => t.profit < 0).reduce((a, b) => a + Math.abs(b.profit), 0);
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : +(grossWin / grossLoss).toFixed(2);

  const rets = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity || 1;
    const curEq = equityCurve[i].equity || 1;
    rets.push((curEq - prev) / prev);
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const var_ = rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1) : 0;
  const sharpeRatio = var_ === 0 ? 0 : +(Math.sqrt(252) * (mean / Math.sqrt(var_))).toFixed(2);

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
    tradesCount
  };

  // Save to DB
  const saved = await Backtest.create({
    userId,
    symbol,
    timeframe,
    initialBalance,
    finalBalance: finalEquity,
    profit: netProfit,
    candlesTested: candles.length,
    strategy,
    tradeBreakdown: trades,
    metrics,
    risk,
    takeProfit,
    stopLoss,
    createdAt: new Date()
  });

  await logToDb(
    userId,
    `[Backtest] ${symbol} | ${timeframe} | Risk: ${risk} | TP: ${takeProfit ?? 0}% | SL: ${stopLoss ?? 0}% | Profit: $${netProfit.toFixed(2)} | Trades: ${tradesCount}`
  );

  return { saved, metrics, equityCurve, trades };
}

/**
 * Run batch backtests
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
