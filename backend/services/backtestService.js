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
    fast: { default: 5, description: "Short-term period for SMA, averaging last 5 candles", min: 1, max: 50 },
    slow: { default: 20, description: "Long-term period for SMA, averaging last 20 candles", min: 5, max: 200 }
  },
  EMA: {
    fast: { default: 8, description: "Short-term period for EMA, faster reaction than SMA", min: 1, max: 50 },
    slow: { default: 21, description: "Long-term period for EMA, smoother trend detection", min: 5, max: 200 }
  },
  RSI: {
    period: { default: 14, description: "Number of candles to calculate RSI", min: 5, max: 50 },
    oversold: { default: 30, description: "RSI level below which asset is considered oversold (BUY)", min: 0, max: 50 },
    overbought: { default: 70, description: "RSI level above which asset is overbought (SELL)", min: 50, max: 100 }
  },
  MACD: {
    fast: { default: 12, description: "Fast EMA for MACD", min: 5, max: 50 },
    slow: { default: 26, description: "Slow EMA for MACD", min: 10, max: 100 },
    signal: { default: 9, description: "Signal line for MACD", min: 1, max: 50 }
  },
  BOLLINGERBANDS: {
    period: { default: 20, description: "MA period for Bollinger Bands", min: 5, max: 100 },
    multiplier: { default: 2, description: "Number of std deviations for upper/lower bands", min: 1, max: 5 }
  },
  STOCHASTIC: {
    k: { default: 14, description: "%K period for Stochastic Oscillator", min: 5, max: 50 }
  },
  VWAP: {
    period: { default: 20, description: "Candles used to calculate Volume Weighted Average Price", min: 5, max: 100 }
  },
  ATR: {
    period: { default: 14, description: "Candles used to calculate Average True Range (ATR)", min: 5, max: 50 }
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
      const f = SMA(prices, Number(params.fast?.default), i);
      const s = SMA(prices, Number(params.slow?.default), i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "EMA": {
      const f = EMA(prices, Number(params.fast?.default), i);
      const s = EMA(prices, Number(params.slow?.default), i);
      return f != null && s != null ? (f > s ? "BUY" : "SELL") : null;
    }
    case "RSI": {
      const r = RSI(prices, Number(params.period?.default), i);
      if (r == null) return null;
      if (r < (params.oversold?.default ?? 30)) return "BUY";
      if (r > (params.overbought?.default ?? 70)) return "SELL";
      return null;
    }
    case "MACD": {
      const m = MACD(
        prices,
        Number(params.fast?.default),
        Number(params.slow?.default),
        Number(params.signal?.default),
        i
      );
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
  const relevant = newsEvents.filter(n => Math.abs(new Date(n.time) - candle.timestamp) < 3600000);
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
export async function runBacktest({
  userId,
  symbol,
  strategy,
  strategyId,
  timeframe,
  initialBalance = 10000,
  risk = "Medium",
  takeProfit = null,
  stopLoss = null,
  limit = 2000,
  startDate,
  endDate,
  tradeConfig = {},
}) {
  const candles = await getCachedOHLCV(symbol, startDate, endDate);
  const news = await fetchHistoricalNews(symbol, startDate, endDate);

  let balance = initialBalance, position = 0;
  const trades = [];

  for (let i = 0; i < candles.length; i++) {
    let price = applyNewsImpact(candles[i], tradeConfig.useNews ? news : []);
    if (tradeConfig.useSpread) price = applySpread(price, 0.05).buy;
    if (tradeConfig.useSlippage) price = applySlippage(price, tradeConfig.baseSlippageBps ?? 5);

    const signal = executeStrategy(strategy?.strategyType, candles, i, strategy?.params);

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

  const backtest = new Backtest({
    userId,
    symbol,
    strategy: strategy?.name || strategyId,
    trades,
    finalBalance: balance,
    startDate,
    endDate,
    createdAt: new Date()
  });
  await backtest.save();
  await logToDb(userId, `[BacktestService] Completed backtest for ${symbol} with ${strategy?.name || strategyId}`);

  return { finalBalance: balance, trades };
}

/**
 * -----------------------------
 * RUN BATCH BACKTESTS
 * -----------------------------
 */
export async function runBatchBacktests(userId, strategy, strategyConfigs, startDate, endDate) {
  const results = [];
  for (const config of strategyConfigs) {
    const res = await runBacktest({ userId, strategy, ...config, startDate, endDate });
    results.push({ ...config, ...res });
  }
  return results;
}
