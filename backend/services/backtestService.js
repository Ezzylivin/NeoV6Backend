// src/backend/services/backtestService.js
import { fetchOHLCV } from './marketDataService.js';
import Backtest from '../dbStructure/backtest.js';

/**
 * Small math helpers used by backtest
 */
function sma(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
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
    const v = values[i] * k + prev * (1 - k);
    out.push(v);
    prev = v;
  }
  return out;
}

function rsi(values, period = 14) {
  const out = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= values.length - 1; i++) {
    const diff = values[i] - values[i - 1];
    if (i <= period) {
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
      if (i < period) {
        out.push(null);
        continue;
      } else {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out.push(100 - 100 / (1 + rs));
        continue;
      }
    }
    // Wilder smoothing
    const prevGain = gains / period;
    const prevLoss = losses / period;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    gains = prevGain * (period - 1) + gain;
    losses = prevLoss * (period - 1) + loss;
    const rs = losses === 0 ? 100 : (gains / period) / (losses / period);
    out.push(100 - 100 / (1 + rs));
  }
  // ensure same length
  while (out.length < values.length) out.unshift(null);
  return out;
}

/**
 * Compute simple metrics from equity curve
 */
function computeMetrics(equityCurve, initialBalance) {
  if (!equityCurve || equityCurve.length === 0) {
    return {
      finalBalance: initialBalance,
      netProfit: 0,
      winRate: 0,
      tradesCount: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      sharpeRatio: 0,
    };
  }
  const finalBalance = equityCurve[equityCurve.length - 1].equity;
  const netProfit = finalBalance - initialBalance;

  // tradesCount isn't on equityCurve; caller should pass trades length; set 0 for now
  // Max drawdown: largest peak-to-trough percentage
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
    sharpeRatio: 0,
  };
}

/**
 * Run a single backtest on OHLCV data with chosen strategy and SL/TP
 * - prices: array of candes in ccxt format [ts, o, h, l, c, v]
 * - strategy: { name: 'SMA' | 'EMA' | 'RSI' | 'MACD', parameters: {} }
 * - stopLoss, takeProfit are percentages (e.g. 1 = 1%)
 *
 * Return { equityCurve, trades, metrics }
 */
function simulateStrategy(ohlcv, initialBalance, strategy, stopLossPct = 0, takeProfitPct = 0) {
  // defensive copy
  const candles = ohlcv.map(c => ({
    time: c[0],
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5],
  }));

  const closes = candles.map(c => c.close);
  const len = candles.length;
  if (len < 2) return { equityCurve: [], trades: [], metrics: computeMetrics([], initialBalance) };

  // Precompute indicators if needed
  const params = strategy?.parameters || {};
  const short = params.shortPeriod || 12;
  const long = params.longPeriod || 26;
  const smaPeriod = params.smaPeriod || 14;
  const rsiPeriod = params.rsiPeriod || 14;

  const smaArr = sma(closes, smaPeriod);
  const emaArrShort = ema(closes, short);
  const emaArrLong = ema(closes, long);
  const rsiArr = rsi(closes, rsiPeriod);

  // Position model: either flat or long (no leverage). We'll only support long positions for simplicity.
  let balance = initialBalance;
  let position = null; // { entryPrice, amount, entryTime }
  const trades = [];
  const equityCurve = [];

  function pushEquity(ts) {
    const equity = position ? balance + position.amount * (candles.find(c => c.time === ts)?.close ?? closes[closes.length - 1]) : balance;
    equityCurve.push({ time: ts, equity });
  }

  for (let i = Math.max(1, long, smaPeriod, rsiPeriod); i < len; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    // Determine signal
    let signal = null;
    switch ((strategy?.name || 'SMA').toUpperCase()) {
      case 'SMA':
        if (smaArr[i - 1] !== null && smaArr[i] !== null) {
          if (prev.close < smaArr[i - 1] && c.close > smaArr[i]) signal = 'BUY';
          else if (prev.close > smaArr[i - 1] && c.close < smaArr[i]) signal = 'SELL';
        }
        break;
      case 'EMA':
        if (emaArrShort[i - 1] && emaArrLong[i - 1]) {
          if (emaArrShort[i - 1] < emaArrLong[i - 1] && emaArrShort[i] > emaArrLong[i]) signal = 'BUY';
          else if (emaArrShort[i - 1] > emaArrLong[i - 1] && emaArrShort[i] < emaArrLong[i]) signal = 'SELL';
        }
        break;
      case 'RSI':
        if (rsiArr[i] !== null) {
          if (rsiArr[i] < 30) signal = 'BUY';
          else if (rsiArr[i] > 70) signal = 'SELL';
        }
        break;
      case 'MACD':
        // MACD simple: diff of emaShort/emaLong crossover
        const macdPrev = emaArrShort[i - 1] - emaArrLong[i - 1];
        const macdNow = emaArrShort[i] - emaArrLong[i];
        if (macdPrev < 0 && macdNow > 0) signal = 'BUY';
        else if (macdPrev > 0 && macdNow < 0) signal = 'SELL';
        break;
      default:
        break;
    }

    // Manage existing position: apply stop-loss / take-profit intrabar using high/low
    if (position) {
      // compute stop/tp price
      const entry = position.entryPrice;
      const slPrice = stopLossPct > 0 ? entry * (1 - stopLossPct / 100) : null;
      const tpPrice = takeProfitPct > 0 ? entry * (1 + takeProfitPct / 100) : null;

      let closedThisBar = false;

      // If TP or SL triggered intrabar (we'll check high/low)
      if (tpPrice && c.high >= tpPrice) {
        // close at tpPrice
        balance += position.amount * tpPrice;
        trades.push({
          entryTime: position.entryTime,
          exitTime: c.time,
          entryPrice: position.entryPrice,
          exitPrice: tpPrice,
          position: 'long',
          profit: +(position.amount * (tpPrice - position.entryPrice)).toFixed(8),
        });
        position = null;
        closedThisBar = true;
      } else if (slPrice && c.low <= slPrice) {
        // close at slPrice
        balance += position.amount * slPrice;
        trades.push({
          entryTime: position.entryTime,
          exitTime: c.time,
          entryPrice: position.entryPrice,
          exitPrice: slPrice,
          position: 'long',
          profit: +(position.amount * (slPrice - position.entryPrice)).toFixed(8),
        });
        position = null;
        closedThisBar = true;
      } else {
        // If SELL signal and not closed, close at close price
        if (signal === 'SELL') {
          balance += position.amount * c.close;
          trades.push({
            entryTime: position.entryTime,
            exitTime: c.time,
            entryPrice: position.entryPrice,
            exitPrice: c.close,
            position: 'long',
            profit: +(position.amount * (c.close - position.entryPrice)).toFixed(8),
          });
          position = null;
          closedThisBar = true;
        }
      }

      // push equity snapshot for this bar
      pushEquity(c.time);
      if (closedThisBar) continue; // move next bar
    } else {
      // no position
      if (signal === 'BUY' && balance > 0) {
        const amount = balance / c.close; // fully invest
        position = { entryPrice: c.close, amount, entryTime: c.time };
        balance = 0;
        // snapshot right after entry
        pushEquity(c.time);
        continue;
      }
    }

    // If nothing happened, push equity snapshot
    pushEquity(c.time);
  }

  // close leftover position at last close
  const last = candles[candles.length - 1];
  if (position) {
    balance += position.amount * last.close;
    trades.push({
      entryTime: position.entryTime,
      exitTime: last.time,
      entryPrice: position.entryPrice,
      exitPrice: last.close,
      position: 'long',
      profit: +(position.amount * (last.close - position.entryPrice)).toFixed(8),
    });
    position = null;
    pushEquity(last.time);
  }

  const metrics = computeMetrics(equityCurve, initialBalance);
  metrics.tradesCount = trades.length;
  // compute winRate and profitFactor
  const wins = trades.filter(t => t.profit > 0).length;
  metrics.winRate = trades.length ? +(wins / trades.length * 100).toFixed(2) : 0;
  const grossWin = trades.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((s, t) => s + t.profit, 0));
  metrics.profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : +(grossWin / grossLoss).toFixed(2);

  return { equityCurve, trades, metrics };
}

/**
 * Main exported function:
 * runRealisticBacktest({ userId, exchange, symbol, timeframe, initialBalance, strategy, stopLoss, takeProfit })
 * - fetches historical data
 * - runs simulation
 * - saves Backtest document
 */
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
 risk = "Medium" 
}) {
  // 1) normalize symbol
  // try to fetch ohlcv (marketDataService handles candidates and cache)
  const ohlcv = await fetchOHLCV(exchange, symbol, timeframe, limit);

  // 2) run simulation
  const { equityCurve, trades, metrics } = simulateStrategy(ohlcv, initialBalance, strategy, stopLoss, takeProfit);

  // 3) save to DB
 // inside runRealisticBacktest()
const saved = await Backtest.create({
  userId,
  exchange,
  symbol,
  timeframe,
  initialBalance,
  strategy: {
    name: strategy.name || strategy,
    parameters: strategy.parameters || {}
  },
  stopLoss,
  takeProfit,
  risk: params?.risk || "Medium", // optional, for filtering
  results: {
    profit: +(metrics.netProfit || (metrics.finalBalance - initialBalance)).toFixed(2),
    finalBalance: +(metrics.finalBalance || initialBalance).toFixed(2),
  },
  trades: trades.map(t => ({ ...t })),
  equityCurve: equityCurve.map(p => ({ time: new Date(p.time), equity: p.equity })),
});


  // attach metrics & arrays for controller response
  return {
    saved,
    metrics,
    equityCurve: equityCurve.map(p => ({ time: p.time, equity: p.equity })),
    trades,
  };
}

/**
 * Run batch backtests concurrently (with a concurrency cap)
 */
export async function runBatchBacktests(userId, exchange = 'coinbasepro', paramCombos = []) {
  const results = [];
  const concurrency = 4;
  const queue = paramCombos.slice();

  const workers = Array.from({ length: concurrency }).map(() =>
    (async function worker() {
      while (queue.length) {
        const params = queue.shift();
        try {
          const r = await runRealisticBacktest({
            userId,
            exchange,
            symbol: params.symbol,
            timeframe: params.timeframe,
            initialBalance: params.initialBalance,
            strategy: params.strategy,
            stopLoss: params.stopLoss,
            takeProfit: params.takeProfit,
            limit: params.limit || 1000,
          });
          results.push({ params, saved: r.saved, metrics: r.metrics });
        } catch (err) {
          console.warn('Batch backtest failed for params', params, err.message || err);
        }
      }
    })()
  );

  await Promise.all(workers);

  // pick best by profit
  let best = null;
  for (const r of results) {
    if (!best || (r.saved.results?.profit ?? 0) > (best.saved.results?.profit ?? 0)) best = r;
  }

  return { results, best };
}
