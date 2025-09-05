import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";

// ---------------------
// INDICATOR HELPERS
// ---------------------
const SMA = (arr, p, i) => {
  if (i < p) return null;
  let sum = 0;
  for (let k = i - p; k < i; k++) sum += arr[k];
  return sum / p;
};

const EMA = (arr, p, i) => {
  if (i < p) return null;
  const k = 2 / (p + 1);
  let ema = arr[i - p];
  for (let j = i - p + 1; j < i; j++) {
    ema = arr[j] * k + ema * (1 - k);
  }
  return ema;
};

const RSI = (arr, p, i) => {
  if (i < p + 1) return null;
  let gains = 0, losses = 0;
  for (let k = i - p + 1; k <= i; k++) {
    const delta = arr[k] - arr[k - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
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
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / p;
  return Math.sqrt(variance);
};

// ---------------------
// STRATEGY EXECUTION
// ---------------------
function executeStrategy(strategyName, candles, i, parameters = {}) {
  const priceArr = candles.map(c => c.price);
  const p = priceArr[i];

  switch ((strategyName || "").toUpperCase()) {
    case "SMA": {
      const f = SMA(priceArr, Number(parameters.fast) || 5, i);
      const s = SMA(priceArr, Number(parameters.slow) || 20, i);
      if (f == null || s == null) return null;
      return f > s ? "BUY" : "SELL";
    }
    case "EMA": {
      const f = EMA(priceArr, Number(parameters.fast) || 8, i);
      const s = EMA(priceArr, Number(parameters.slow) || 21, i);
      if (f == null || s == null) return null;
      return f > s ? "BUY" : "SELL";
    }
    case "RSI": {
      const r = RSI(priceArr, Number(parameters.period) || 14, i);
      if (r == null) return null;
      if (r < (Number(parameters.oversold) || 30)) return "BUY";
      if (r > (Number(parameters.overbought) || 70)) return "SELL";
      return null;
    }
    case "MACD": {
      const m = MACD(priceArr, Number(parameters.fast) || 12, Number(parameters.slow) || 26, Number(parameters.signal) || 9, i);
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
      const vwap = SMA(priceArr, Number(parameters.period) || 20, i);
      if (!vwap) return null;
      return p > vwap ? "BUY" : "SELL";
    }
    case "ATR": {
      const sd = STDEV(priceArr, Number(parameters.period) || 14, i);
      const prevSd = STDEV(priceArr, Number(parameters.period) || 14, i - 1);
      if (sd == null || prevSd == null) return null;
      return sd >= prevSd ? "BUY" : "SELL";
    }
    default:
      return i < 1 ? null : candles[i].price > candles[i - 1].price ? "BUY" : "SELL";
  }
}

// ---------------------
// EXCHANGE & FETCH OHLCV
// ---------------------
const EXCHANGE_LIST = ["binance", "kraken", "coinbase", "gemini"];
async function fetchOHLCVMulti(symbol, timeframe = "1h", limit = 2000) {
  let lastErr = null;
  for (const ex of EXCHANGE_LIST) {
    try {
      const ohlcv = await fetchOHLCV(ex, symbol, timeframe, limit);
      return ohlcv.map(c => ({ time: new Date(c[0]), price: c[4] }));
    } catch (err) {
      console.warn(`[Backtest] ${symbol} failed on ${ex}: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All exchanges failed for ${symbol}: ${lastErr?.message || "unknown error"}`);
}

// ---------------------
// POSITION SIZING
// ---------------------
const RISK_SIZING = { Low: 0.25, Medium: 0.5, High: 1 };

// ---------------------
// RUN SINGLE BACKTEST
// ---------------------
export async function runBacktest({ userId, strategyId=null, symbol, timeframe="1h", initialBalance=1000, strategy={name:"SMA", parameters:{}}, risk="Medium", takeProfit=null, stopLoss=null, slippageBps=5, limit=2000 }={}) {
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

  if (!userId || !symbol || !strategy?.name) throw new Error("Missing userId, symbol, or strategy.name");

  console.log("[RunBacktest Payload]", { userId, symbol, timeframe, initialBalance, strategy, risk, takeProfit, stopLoss, limit });

  let candles = [];
  try {
    candles = await fetchOHLCVMulti(symbol, timeframe, limit);
  } catch (err) {
    console.error(`[Backtest] Failed fetch OHLCV: ${err.message}`);
    const emptyMetrics = { initialBalance, finalBalance: initialBalance, netProfit:0, winRate:0, maxDrawdown:0, profitFactor:0, sharpeRatio:0, cagr:0, tradesCount:0 };
    return { saved:null, metrics: emptyMetrics, equityCurve:[], trades:[] };
  }

  let cash = initialBalance, asset = 0, entryPrice = null, openIndex = null;
  const trades = [], equityCurve = [];
  const slip = slippageBps / 10000;

  const prices = candles.map(c => c.price);
  for (let i = 0; i < candles.length; i++) {
    const action = executeStrategy(strategy.name, candles, i, strategy.parameters);
    if (!action) { equityCurve.push(cash + asset * prices[i]); continue; }

    if (action === "BUY" && cash > 0) {
      const size = cash * (RISK_SIZING[risk] || 0.5);
      entryPrice = prices[i]*(1+slip);
      asset += size / entryPrice;
      cash -= size;
      openIndex = i;
    } else if (action === "SELL" && asset > 0) {
      const sellPrice = prices[i]*(1-slip);
      cash += asset * sellPrice;
      trades.push({ entryIndex: openIndex, exitIndex: i, entryPrice, exitPrice: sellPrice, pnl: (sellPrice-entryPrice)*asset });
      asset = 0; entryPrice = null; openIndex = null;
    }
    // Intrabar TP/SL
    if (entryPrice && takeProfit && prices[i] >= entryPrice*(1+takeProfit/100)) {
      const sellPrice = prices[i]*(1-slip);
      cash += asset * sellPrice;
      trades.push({ entryIndex: openIndex, exitIndex: i, entryPrice, exitPrice: sellPrice, pnl: (sellPrice-entryPrice)*asset });
      asset = 0; entryPrice = null; openIndex = null;
    }
    if (entryPrice && stopLoss && prices[i] <= entryPrice*(1-stopLoss/100)) {
      const sellPrice = prices[i]*(1-slip);
      cash += asset * sellPrice;
      trades.push({ entryIndex: openIndex, exitIndex: i, entryPrice, exitPrice: sellPrice, pnl: (sellPrice-entryPrice)*asset });
      asset = 0; entryPrice = null; openIndex = null;
    }

    equityCurve.push(cash + asset*prices[i]);
  }

  const finalBalance = cash + asset*prices[candles.length-1];
  const netProfit = finalBalance - initialBalance;
  const wins = trades.filter(t => t.pnl>0).length;
  const winRate = trades.length ? wins/trades.length : 0;
  const drawdowns = [];
  let peak = equityCurve[0] || initialBalance;
  for (const val of equityCurve) { peak = Math.max(peak,val); drawdowns.push(peak-val); }
  const maxDrawdown = Math.max(...drawdowns);

  const profitFactor = trades.filter(t=>t.pnl>0).reduce((a,b)=>a+b.pnl,0)/Math.max(trades.filter(t=>t.pnl<0).reduce((a,b)=>a+b.pnl,0)*-1,1e-9);

  const dailyReturns = [];
  for (let i=1;i<equityCurve.length;i++) dailyReturns.push(equityCurve[i]/equityCurve[i-1]-1);
  const mean = dailyReturns.reduce((a,b)=>a+b,0)/Math.max(dailyReturns.length,1);
  const variance = dailyReturns.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(dailyReturns.length-1,1);
  const sharpeRatio = variance>0?mean/Math.sqrt(variance):0;

  const totalDays = (candles[candles.length-1].time-candles[0].time)/(1000*60*60*24)||1;
  const cagr = Math.pow(finalBalance/initialBalance,1/totalDays)-1;

  const saved = await Backtest.create({ userId, strategy: strategy.name, symbol, timeframe, initialBalance, finalBalance, netProfit, winRate, maxDrawdown, profitFactor, sharpeRatio, cagr, tradesCount: trades.length, risk, takeProfit, stopLoss });

  return { saved, metrics:{initialBalance, finalBalance, netProfit, winRate, maxDrawdown, profitFactor, sharpeRatio, cagr, tradesCount: trades.length}, equityCurve, trades };
}
