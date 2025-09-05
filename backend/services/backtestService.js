// File: backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";

/**
 * -----------------------------
 * CONSTANTS
 * -----------------------------
 */
const EXCHANGES = ["binance", "kraken", "coinbase", "gemini"];
const RISK_SIZES = { Low: 0.25, Medium: 0.5, High: 1 };
const TRADING_DAYS_PER_YEAR = 252; // For Sharpe Ratio calculation
const MS_PER_DAY = 24 * 3600 * 1000;
const EPSILON = 1e-9; // Small number to prevent division by zero

/**
 * -----------------------------
 * INDICATOR HELPERS
 * -----------------------------
 */
const SMA = (arr, period, i) => {
  if (i < period - 1) return null; // Adjusted index check
  return arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
};

const EMA = (arr, period, i) => {
  if (i < period - 1) return null; // Adjusted index check
  const k = 2 / (period + 1);
  let ema = arr.slice(i - period + 1, i + 1)[0]; // Initialize with first value in the window
  for (let idx = i - period + 2; idx <= i; idx++) {
    ema = arr[idx] * k + ema * (1 - k);
  }
  return ema;
};

const RSI = (arr, period, i) => {
  if (i < period) return null; // Adjusted index check
  let gains = 0, losses = 0;
  // Calculate gains and losses over the period
  for (let idx = i - period + 1; idx <= i; idx++) {
    const change = arr[idx] - arr[idx - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  // Prevent division by zero
  const rs = losses === 0 ? (gains === 0 ? 0 : 100) : gains / losses;
  return 100 - 100 / (1 + rs);
};

const MACD = (arr, fast = 12, slow = 26, signal = 9, i) => {
  // Need enough data for slow EMA + signal EMA
  if (i < slow + signal - 1) return null;

  const fastEmaValue = EMA(arr, fast, i);
  const slowEmaValue = EMA(arr, slow, i);

  if (fastEmaValue === null || slowEmaValue === null) return null;

  const macdLine = fastEmaValue - slowEmaValue;

  // Calculate signal line as EMA of MACD line
  // We need to calculate MACD for the signal period to get its EMA
  const macdValuesForSignal = [];
  for (let idx = i - signal + 1; idx <= i; idx++) {
    const fe = EMA(arr, fast, idx);
    const se = EMA(arr, slow, idx);
    if (fe !== null && se !== null) {
      macdValuesForSignal.push(fe - se);
    } else {
      // Not enough data for full signal period
      return null;
    }
  }

  // Ensure enough data for the signal EMA
  if (macdValuesForSignal.length < signal) return null;

  // EMA calculation for the signal line based on the collected MACD values
  const signalLine = EMA(macdValuesForSignal, signal, macdValuesForSignal.length - 1);

  if (signalLine === null) return null;

  return { macd: macdLine, sig: signalLine };
};

const STDEV = (arr, period, i) => {
  if (i < period - 1) return null; // Adjusted index check
  const slice = arr.slice(i - period + 1, i + 1);
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
      if (i < kPeriod + dPeriod - 1) return null; // Adjusted index check
      // Stochastic typically needs High, Low, Close (price) over the period
      // Assuming 'price' is close, and 'high' and 'low' are derived from the window
      const window = candles.slice(i - kPeriod + 1, i + 1); // Correct window slice
      const high = Math.max(...window.map(c => c.price));
      const low = Math.min(...window.map(c => c.price));
      const k = ((price - low) / Math.max(high - low, EPSILON)) * 100;

      // To calculate D, you'd need a moving average of K values.
      // For simplicity, using K directly for buy/sell here.
      // A full Stochastic implementation would compute %D by taking an SMA of %K.
      if (k < (params.oversold || 20)) return "BUY";
      if (k > (params.overbought || 80)) return "SELL";
      return null;
    }
    case "VWAP": {
      // VWAP usually requires volume. Your candles only have price.
      // Current implementation is a simple SMA, not true VWAP.
      // If full VWAP is needed, `fetchOHLCV` must return volume.
      const vwap = SMA(prices, Number(params.period) || 20, i);
      return vwap != null ? (price > vwap ? "BUY" : "SELL") : null;
    }
    case "ATR": {
      // ATR requires High, Low, Close from candles. Your candles only have price (close).
      // Assuming 'price' for current ATR calculation, which is a simplification.
      const period = Number(params.period) || 14;
      const sd = STDEV(prices, period, i);
      const prevSd = STDEV(prices, period, i - 1); // Comparing current SD to previous SD
      return sd != null && prevSd != null ? (sd >= prevSd ? "BUY" : "SELL") : null;
    }
    default:
      if (i < 1) return null;
      return price > prices[i - 1] ? "BUY" : "SELL"; // Simple momentum strategy
  }
}

/**
 * -----------------------------
 * BACKTEST ENGINE
 * -----------------------------
 */
async function fetchOHLCVMulti(symbol, timeframe = "1h", limit = 2000, startDate = null, endDate = null) {
  let lastErr;
  for (const ex of EXCHANGES) {
    try {
      // Pass startDate and endDate to fetchOHLCV
      // startDate and endDate here are expected to be Date objects or null
      const ohlcv = await fetchOHLCV(ex, symbol, timeframe, limit, startDate, endDate);
      // c[0] is timestamp, c[4] is close price
      return ohlcv.map(c => ({ time: new Date(c[0]), price: c[4] }));
    } catch (err) {
      console.warn(`[Backtest] Failed on ${ex} for ${symbol} with dates (${startDate?.toISOString() ?? 'N/A'}-${endDate?.toISOString() ?? 'N/A'}): ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All exchanges failed for ${symbol} with dates (${startDate?.toISOString() ?? 'N/A'}-${endDate?.toISOString() ?? 'N/A'}): ${lastErr?.message || "unknown"}`);
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
  slippageBps = 5,
  limit = 2000,
  startDate = null, // ✅ Add startDate
  endDate = null    // ✅ Add endDate
} = {}) {

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
      // Ensure that dates from strategy doc are Date objects if they are saved as ISO strings
      startDate = startDate || (stratDoc.params.startDate ? new Date(stratDoc.params.startDate) : null);
      endDate = endDate || (stratDoc.params.endDate ? new Date(stratDoc.params.endDate) : null);
    }
  }

  if (!userId || !symbol || !strategy?.name) throw new Error("Missing required fields");

  let candles;
  try {
    // ✅ Pass startDate and endDate to fetchOHLCVMulti
    candles = await fetchOHLCVMulti(symbol, timeframe, limit, startDate, endDate);
  } catch (err) {
    console.error(`[Backtest] Failed OHLCV:`, err.message);
    // Propagate the error up to the controller to provide a proper 500 response
    throw new Error(`Failed to fetch OHLCV data: ${err.message}`);
  }

  if (candles.length === 0) {
    // Handle case where no candles are returned
    console.warn(`[Backtest] No candles fetched for ${symbol} with dates (${startDate?.toISOString() ?? 'N/A'}-${endDate?.toISOString() ?? 'N/A'})`);
    return {
      saved: null,
      metrics: { netProfit: 0, tradesCount: 0, initialBalance, finalBalance: initialBalance, winRate: 0, maxDrawdown: 0, profitFactor: 0, sharpeRatio: 0, cagr: 0 },
      equityCurve: [{ time: new Date(), equity: initialBalance }],
      trades: []
    };
  }

  let cash = initialBalance, asset = 0, entryPrice = null, openIndex = null;
  const trades = [], equityCurve = [];
  const slip = slippageBps / 10000;
  const sizeFrac = RISK_SIZES[risk] ?? 0.5;

  // Ensure equity curve starts with initial balance
  equityCurve.push({ time: candles[0].time, equity: +initialBalance.toFixed(2) });

  for (let i = 1; i < candles.length; i++) {
    const price = candles[i].price;
    // Only push to equity curve if there's a change or it's a new time point
    const currentEquity = +(cash + asset * price).toFixed(2);
    if (equityCurve[equityCurve.length - 1].time.getTime() !== candles[i].time.getTime() ||
        equityCurve[equityCurve.length - 1].equity !== currentEquity) {
      equityCurve.push({ time: candles[i].time, equity: currentEquity });
    }

    const decision = executeStrategy(strategy.name, candles, i, strategy.parameters);

    // Close position
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

  // Final metrics
  const finalEquity = +(cash + asset * candles[candles.length - 1].price).toFixed(2);
  // Ensure the very last equity point is always captured
  if (equityCurve[equityCurve.length - 1].time.getTime() !== candles[candles.length - 1].time.getTime() ||
      equityCurve[equityCurve.length - 1].equity !== finalEquity) {
    equityCurve.push({ time: candles[candles.length - 1].time, equity: finalEquity });
  }


  const netProfit = +(finalEquity - initialBalance).toFixed(2);
  const tradesCount = trades.length;
  const wins = trades.filter(t => t.profit > 0).length;
  const winRate = tradesCount ? +(100 * wins / tradesCount).toFixed(2) : 0;

  let peak = initialBalance, maxDd = 0; // Initialize peak with initialBalance
  for (const pt of equityCurve) {
    peak = Math.max(peak, pt.equity);
    maxDd = Math.max(maxDd, (peak - pt.equity) / (peak || EPSILON));
  }

  const grossWin = trades.filter(t => t.profit > 0).reduce((a, b) => a + b.profit, 0);
  const grossLoss = trades.filter(t => t.profit < 0).reduce((a, b) => a + Math.abs(b.profit), 0);
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : +(grossWin / grossLoss).toFixed(2);

  const rets = equityCurve.slice(1).map((p, idx) => (p.equity - equityCurve[idx].equity) / (equityCurve[idx].equity || EPSILON));
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const var_ = rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1) : 0;
  const sharpeRatio = var_ === 0 ? 0 : +(Math.sqrt(TRADING_DAYS_PER_YEAR) * (mean / Math.sqrt(var_))).toFixed(2); // Use constant

  const years = Math.max((candles[candles.length - 1].time - candles[0].time) / (365 * MS_PER_DAY), 1 / 365); // Use constant
  const cagr = +((Math.pow(finalEquity / initialBalance, 1 / years) - 1) * 100).toFixed(2);

  const metrics = { initialBalance, finalBalance: finalEquity, netProfit, winRate, maxDrawdown: +(maxDd * 100).toFixed(2), profitFactor, sharpeRatio, cagr, tradesCount };

  // Store startDate and endDate in the database
  const saved = await Backtest.create({ userId, symbol, timeframe, initialBalance, finalBalance: finalEquity, profit: netProfit, candlesTested: candles.length, strategy, tradeBreakdown: trades, metrics, risk, takeProfit, stopLoss, startDate, endDate, createdAt: new Date() });

  await logToDb(userId, `[Backtest] ${symbol} | ${timeframe} | Risk: ${risk} | TP: ${takeProfit ?? 0}% | SL: ${stopLoss ?? 0}% | Profit: $${netProfit.toFixed(2)} | Trades: ${tradesCount} | Dates: ${startDate ? startDate.toISOString().split('T')[0] : 'N/A'} - ${endDate ? endDate.toISOString().split('T')[0] : 'N/A'}`);

  return { saved, metrics, equityCurve, trades };
}

export async function runBatchBacktests(userId, _exchange, paramCombos) {
  const results = [];
  let best = null;
  for (const combo of paramCombos) {
    try {
      // Pass the full combo including startDate/endDate
      const result = await runBacktest({ userId, ...combo });
      results.push(result);
      if (!best || result.metrics.netProfit > best.metrics.netProfit) best = result;
    } catch (err) {
      console.error(`[Batch Backtest] Error for combo ${JSON.stringify(combo)}: ${err.message}`);
      // Optionally, push an error object or skip this combo
      results.push({
        saved: null,
        metrics: { netProfit: 0, tradesCount: 0, initialBalance: combo.initialBalance || 0, finalBalance: combo.initialBalance || 0, winRate: 0, maxDrawdown: 0, profitFactor: 0, sharpeRatio: 0, cagr: 0 },
        equityCurve: [{ time: new Date(), equity: combo.initialBalance || 0 }],
        trades: [],
        error: err.message
      });
    }
  }
  return { results, best };
}

export const runRealisticBacktest = runBacktest;
