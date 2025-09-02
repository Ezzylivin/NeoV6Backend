// File: src/backend/services/backtestService.js
import { fetchOHLCV } from './marketDataService.js';
import Backtest from '../dbStructure/backtest.js';

/* ---------- Math Helpers ---------- */
function sma(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function ema(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    const val = values[i] * k + prev * (1 - k);
    out.push(val);
    prev = val;
  }
  return out;
}

function rsi(values, period = 14) {
  const out = [];
  let gains = 0, losses = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (i <= period) {
      if (diff > 0) gains += diff; else losses += Math.abs(diff);
      if (i < period) { out.push(null); continue; }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out.push(100 - 100 / (1 + rs));
      continue;
    }
    const prevGain = gains / period;
    const prevLoss = losses / period;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    gains = prevGain * (period - 1) + gain;
    losses = prevLoss * (period - 1) + loss;
    const rs = losses === 0 ? 100 : (gains / period) / (losses / period);
    out.push(100 - 100 / (1 + rs));
  }
  while (out.length < values.length) out.unshift(null);
  return out;
}

/* ---------- Metrics ---------- */
function computeMetrics(equityCurve, initialBalance) {
  if (!equityCurve?.length) return {
    finalBalance: initialBalance,
    netProfit: 0,
    winRate: 0,
    tradesCount: 0,
    maxDrawdown: 0,
    profitFactor: 0,
    sharpeRatio: 0
  };

  const finalBalance = equityCurve[equityCurve.length - 1].equity;
  const netProfit = finalBalance - initialBalance;

  let peak = equityCurve[0].equity;
  let maxDD = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = (peak - p.equity) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    finalBalance,
    netProfit,
    winRate: 0,
    tradesCount: 0,
    maxDrawdown: +(maxDD * 100).toFixed(2),
    profitFactor: 0,
    sharpeRatio: 0
  };
}

/* ---------- Simulation ---------- */
function simulateStrategy(ohlcv, initialBalance, strategy, stopLossPct = 0, takeProfitPct = 0) {
  const candles = ohlcv.map(c => ({ time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }));
  const closes = candles.map(c => c.close);
  const len = candles.length;
  if (len < 2) return { equityCurve: [], trades: [], metrics: computeMetrics([], initialBalance) };

  const params = strategy.parameters || {};
  const short = params.shortPeriod || 12;
  const long = params.longPeriod || 26;
  const smaPeriod = params.smaPeriod || 14;
  const rsiPeriod = params.rsiPeriod || 14;

  const smaArr = sma(closes, smaPeriod);
  const emaShort = ema(closes, short);
  const emaLong = ema(closes, long);
  const rsiArr = rsi(closes, rsiPeriod);

  let balance = initialBalance;
  let position = null;
  const trades = [];
  const equityCurve = [];

  function pushEquity(ts) {
    const equity = position ? balance + position.amount * (candles.find(c => c.time === ts)?.close ?? closes[len - 1]) : balance;
    equityCurve.push({ time: ts, equity });
  }

  for (let i = Math.max(1, long, smaPeriod, rsiPeriod); i < len; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    let signal = null;

    switch (strategy.name.toUpperCase()) {
      case 'SMA':
        if (smaArr[i - 1] !== null && smaArr[i] !== null) {
          if (prev.close < smaArr[i - 1] && c.close > smaArr[i]) signal = 'BUY';
          else if (prev.close > smaArr[i - 1] && c.close < smaArr[i]) signal = 'SELL';
        }
        break;
      case 'EMA':
        if (emaShort[i - 1] && emaLong[i - 1]) {
          if (emaShort[i - 1] < emaLong[i - 1] && emaShort[i] > emaLong[i]) signal = 'BUY';
          else if (emaShort[i - 1] > emaLong[i - 1] && emaShort[i] < emaLong[i]) signal = 'SELL';
        }
        break;
      case 'RSI':
        if (rsiArr[i] !== null) {
          if (rsiArr[i] < 30) signal = 'BUY';
          else if (rsiArr[i] > 70) signal = 'SELL';
        }
        break;
      case 'MACD':
        const macdPrev = emaShort[i - 1] - emaLong[i - 1];
        const macdNow = emaShort[i] - emaLong[i];
        if (macdPrev < 0 && macdNow > 0) signal = 'BUY';
        else if (macdPrev > 0 && macdNow < 0) signal = 'SELL';
        break;
      default: break;
    }

    /* ---------- Manage Position ---------- */
    if (position) {
      const entry = position.entryPrice;
      const slPrice = stopLossPct > 0 ? entry * (1 - stopLossPct / 100) : null;
      const tpPrice = takeProfitPct > 0 ? entry * (1 + takeProfitPct / 100) : null;
      let closed = false;

      if (tpPrice && c.high >= tpPrice) {
        balance += position.amount * tpPrice;
        trades.push({ entryTime: position.entryTime, exitTime: c.time, entryPrice: position.entryPrice, exitPrice: tpPrice, position: 'long', profit: +(position.amount * (tpPrice - position.entryPrice)).toFixed(8) });
        position = null; closed = true;
      } else if (slPrice && c.low <= slPrice) {
        balance += position.amount * slPrice;
        trades.push({ entryTime: position.entryTime, exitTime: c.time, entryPrice: position.entryPrice, exitPrice: slPrice, position: 'long', profit: +(position.amount * (slPrice - position.entryPrice)).toFixed(8) });
        position = null; closed = true;
      } else if (signal === 'SELL') {
        balance += position.amount * c.close;
        trades.push({ entryTime: position.entryTime, exitTime: c.time, entryPrice: position.entryPrice, exitPrice: c.close, position: 'long', profit: +(position.amount * (c.close - position.entryPrice)).toFixed(8) });
        position = null; closed = true;
      }

      pushEquity(c.time);
      if (closed) continue;
    } else if (signal === 'BUY' && balance > 0) {
      const amount = balance / c.close;
      position = { entryPrice: c.close, amount, entryTime: c.time };
      balance = 0;
      pushEquity(c.time);
      continue;
    }

    pushEquity(c.time);
  }

  /* ---------- Close leftover position ---------- */
  const last = candles[len - 1];
  if (position) {
    balance += position.amount * last.close;
    trades.push({ entryTime: position.entryTime, exitTime: last.time, entryPrice: position.entryPrice, exitPrice: last.close, position: 'long', profit: +(position.amount * (last.close - position.entryPrice)).toFixed(8) });
    position = null;
    pushEquity(last.time);
  }

  /* ---------- Metrics ---------- */
  const metrics = computeMetrics(equityCurve, initialBalance);
  metrics.tradesCount = trades.length;
  const wins = trades.filter(t => t.profit > 0).length;
  metrics.winRate = trades.length ? +(wins / trades.length * 100).toFixed(2) : 0;
  const grossWin = trades.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((s, t) => s + t.profit, 0));
  metrics.profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : +(grossWin / grossLoss).toFixed(2);

  return { equityCurve, trades, metrics };
}

/* ---------- Exported Functions ---------- */
export async function runRealisticBacktest({
  userId,
  exchange = 'coinbasepro',
  symbol = 'BTCUSDT',
  timeframe = '1h',
  initialBalance = 1000,
  strategy = { name: 'SMA', parameters: {} },
  stopLoss = 0,
  takeProfit = 0,
  limit = 1000,
  risk = 'Medium'
}) {
  if (!userId || !symbol) throw new Error("Missing userId or symbol");

  // ensure strategy is normalized
  if (typeof strategy === 'string') strategy = { name: strategy, parameters: {} };
  if (!strategy.parameters) strategy.parameters = {};

  // fetch OHLCV safely
  const ohlcv = (await fetchOHLCV(exchange, symbol, timeframe, limit)) || [];
  if (!ohlcv.length) return { equityCurve: [], trades: [], metrics: computeMetrics([], initialBalance) };

  const { equityCurve, trades, metrics } = simulateStrategy(ohlcv, initialBalance, strategy, stopLoss, takeProfit);

  // safe DB write
  const saved = await Backtest.create({
    userId,
    exchange,
    symbol,
    timeframe,
    initialBalance,
    strategy,
    stopLoss,
    takeProfit,
    risk,
    results: {
      profit: +(metrics.netProfit || 0).toFixed(2),
      finalBalance: +(metrics.finalBalance || initialBalance).toFixed(2),
    },
    trades: trades.map(t => ({ ...t })),
    equityCurve: equityCurve.map(p => ({ time: new Date(p.time), equity: p.equity })),
  });

  return { saved, equityCurve, trades, metrics };
}
