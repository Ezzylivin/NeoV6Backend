// backend/services/backtestService.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { logToDb } from "./logService.js";

/**
 * Map textual risk to a % of equity per trade
 */
const RISK_PCT = {
  low: 0.01,
  medium: 0.02,
  high: 0.05,
  Low: 0.01,
  Medium: 0.02,
  High: 0.05,
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
  // Accepts records that may have {open, high, low, close} or just {price}
  return rows
    .filter(r => r?.timestamp != null)
    .map(r => ({
      time: new Date(r.timestamp),
      open: r.open ?? r.price ?? r.close ?? 0,
      high: r.high ?? r.price ?? r.close ?? 0,
      low: r.low ?? r.price ?? r.close ?? 0,
      close: r.close ?? r.price ?? 0,
    }))
    .filter(c => Number.isFinite(c.close));
}

// --- indicators ---
function SMA(series, period) {
  const out = Array(series.length).fill(null);
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i];
    if (i >= period) sum -= series[i - period];
    if (i >= period - 1) out[i] = +(sum / period).toFixed(8);
  }
  return out;
}
function EMA(series, period) {
  const out = Array(series.length).fill(null);
  const k = 2 / (period + 1);
  for (let i = 0; i < series.length; i++) {
    if (i === 0) out[i] = series[i];
    else out[i] = +(series[i] * k + out[i - 1] * (1 - k)).toFixed(8);
  }
  return out;
}
function RSI(series, period = 14) {
  const out = Array(series.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i < series.length; i++) {
    const ch = series[i] - series[i - 1];
    const gain = Math.max(ch, 0);
    const loss = Math.max(-ch, 0);
    if (i <= period) {
      gains += gain; losses += loss;
      if (i === period) {
        const rs = losses === 0 ? 100 : gains / losses;
        out[i] = +(100 - 100 / (1 + rs)).toFixed(2);
      }
    } else {
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      out[i] = +(100 - 100 / (1 + rs)).toFixed(2);
    }
  }
  return out;
}
function MACD(series, fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(series, fast);
  const emaSlow = EMA(series, slow);
  const macd = emaFast.map((v, i) =>
    v != null && emaSlow[i] != null ? +(v - emaSlow[i]).toFixed(8) : null
  );
  const valid = macd.map(v => (v == null ? 0 : v));
  const signalLine = EMA(valid, signal).map((v, i) => (macd[i] == null ? null : v));
  return { macd, signalLine };
}

// --- metrics ---
function maxDrawdown(equity) {
  let peak = equity[0];
  let mdd = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    mdd = Math.min(mdd, dd);
  }
  return +(mdd * 100).toFixed(2); // %
}
function profitFactor(trades) {
  let gp = 0, gl = 0;
  for (const t of trades) {
    if (t.profit > 0) gp += t.profit;
    else gl += Math.abs(t.profit || 0);
  }
  if (gl === 0) return Infinity;
  return +(gp / gl).toFixed(2);
}
function sharpeRatio(returns, periodsPerYear = 365, rf = 0) {
  if (returns.length < 2) return 0;
  const mean =
    returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const sr = ((mean - rf) * Math.sqrt(periodsPerYear)) / std;
  return +sr.toFixed(2);
}
function cagr(initial, final, start, end) {
  const years = Math.max((end - start) / (365 * 24 * 3600 * 1000), 1 / 365);
  const ratio = final / initial;
  return +((Math.pow(ratio, 1 / years) - 1) * 100).toFixed(2);
}

/**
 * Run a realistic, long-only backtest with next-bar execution, slippage, fees, and risk sizing.
 * Strategies supported: SMA, EMA, RSI, MACD (basic entry/exit rules).
 */
export async function runRealisticBacktest({
  userId,
  symbol,
  timeframe,
  initialBalance,
  strategy = "SMA",
  risk = "Medium",
  feeRate = 0.001,       // 0.10% taker fee per side
  slippageBps = 5        // 5 bps = 0.05% slippage per side
}) {
  const rows = await Price.find({ symbol }).sort({ timestamp: 1 });
  if (!rows.length) throw new Error("No historical data available for this symbol");

  const candles = toCandles(rows);
  const closes = candles.map(c => c.close);
  const periodsPerYear = TF_PER_YEAR[timeframe] ?? 365;

  // indicators for signals
  const smaFast = SMA(closes, 14);
  const ema14 = EMA(closes, 14);
  const rsi14 = RSI(closes, 14);
  const { macd, signalLine } = MACD(closes, 12, 26, 9);

  const slip = slippageBps / 10000;

  let cash = initialBalance;
  let qty = 0;
  let lastEntryIdx = null;

  const trades = [];
  const equityCurve = [];

  // per-candle returns for Sharpe
  const periodicReturns = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const cur = candles[i];
    const next = candles[i + 1]; // execute on next bar open
    const nextOpen = next.open;

    // mark-to-market equity at current close
    const equityNow = cash + qty * cur.close;
    equityCurve.push({ t: cur.time, equity: +equityNow.toFixed(2) });

    // Compute return vs previous equity for Sharpe
    if (equityCurve.length > 1) {
      const prevEq = equityCurve[equityCurve.length - 2].equity;
      const ret = prevEq === 0 ? 0 : (equityNow - prevEq) / prevEq;
      periodicReturns.push(ret);
    }

    // ===== Signal generation by strategy =====
    let buySignal = false;
    let sellSignal = false;

    switch (strategy) {
      case "SMA": {
        // simple close cross above/below SMA(14)
        if (smaFast[i - 1] != null && smaFast[i] != null) {
          const prevCrossUp = closes[i - 1] < smaFast[i - 1] && closes[i] > smaFast[i];
          const prevCrossDown = closes[i - 1] > smaFast[i - 1] && closes[i] < smaFast[i];
          buySignal = prevCrossUp;
          sellSignal = prevCrossDown;
        }
        break;
      }
      case "EMA": {
        if (ema14[i - 1] != null && ema14[i] != null) {
          const crossUp = closes[i - 1] < ema14[i - 1] && closes[i] > ema14[i];
          const crossDown = closes[i - 1] > ema14[i - 1] && closes[i] < ema14[i];
          buySignal = crossUp;
          sellSignal = crossDown;
        }
        break;
      }
      case "RSI": {
        if (rsi14[i] != null) {
          buySignal = rsi14[i] < 30;
          sellSignal = rsi14[i] > 70 && qty > 0;
        }
        break;
      }
      case "MACD": {
        if (macd[i - 1] != null && signalLine[i - 1] != null && macd[i] != null && signalLine[i] != null) {
          const crossUp = macd[i - 1] < signalLine[i - 1] && macd[i] > signalLine[i];
          const crossDown = macd[i - 1] > signalLine[i - 1] && macd[i] < signalLine[i];
          buySignal = crossUp;
          sellSignal = crossDown;
        }
        break;
      }
      default:
        break;
    }

    // ===== Execution on next bar OPEN with slippage + fees =====
    const tradeSizePct = RISK_PCT[risk] ?? 0.02; // default 2%
    if (buySignal && cash > 0) {
      const spend = cash * tradeSizePct;
      if (spend > 0) {
        const fill = nextOpen * (1 + slip);
        const fees = spend * feeRate;
        const qtyBuy = (spend - fees) / fill;
        if (qtyBuy > 0) {
          cash -= spend;
          qty += qtyBuy;
          lastEntryIdx = i + 1;
          trades.push({
            entryTime: next.time,
            position: "long",
            entryPrice: +fill.toFixed(2),
            entryFees: +fees.toFixed(2),
          });
        }
      }
    }
    if (sellSignal && qty > 0) {
      const fill = nextOpen * (1 - slip);
      const gross = qty * fill;
      const fees = gross * feeRate;
      const proceeds = gross - fees;

      const lastTrade = trades.findLast(t => !t.exitTime);
      const entryPrice = lastTrade?.entryPrice ?? cur.close;

      const profit = proceeds - (qty * entryPrice); // assumes previous long qty
      cash += proceeds;

      trades.push({
        exitTime: next.time,
        position: "long",
        exitPrice: +fill.toFixed(2),
        exitFees: +fees.toFixed(2),
        profit: +profit.toFixed(2),
        duration: lastEntryIdx != null
          ? Math.round((next.time - candles[lastEntryIdx].time) / 60000)
          : null,
        result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven",
      });

      qty = 0;
      lastEntryIdx = null;
    }
  }

  // Close any open position at last close (simulated liquidation)
  const last = candles[candles.length - 1];
  if (qty > 0) {
    const fill = last.close * (1 - slip);
    const gross = qty * fill;
    const fees = gross * feeRate;
    const proceeds = gross - fees;
    const lastTrade = trades.findLast(t => !t.exitTime);
    const entryPrice = lastTrade?.entryPrice ?? last.close;
    const profit = proceeds - (qty * entryPrice);
    cash += proceeds;

    trades.push({
      exitTime: last.time,
      position: "long",
      exitPrice: +fill.toFixed(2),
      exitFees: +fees.toFixed(2),
      profit: +profit.toFixed(2),
      duration: lastEntryIdx != null
        ? Math.round((last.time - candles[lastEntryIdx].time) / 60000)
        : null,
      result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven",
    });
    qty = 0;
  }

  const finalEquity = +(cash).toFixed(2);
  const wins = trades.filter(t => t.profit > 0).length;
  const losses = trades.filter(t => t.profit < 0).length;
  const winRate = trades.length ? +(100 * (wins / (wins + losses || 1))).toFixed(2) : 0;

  // finalize equity curve with last point
  equityCurve.push({ t: last.time, equity: finalEquity });

  const metrics = {
    initialBalance: initialBalance,
    finalBalance: finalEquity,
    netProfit: +(finalEquity - initialBalance).toFixed(2),
    winRate,
    maxDrawdown: maxDrawdown(equityCurve.map(e => e.equity)),
    profitFactor: profitFactor(trades.filter(t => typeof t.profit === "number")),
    sharpeRatio: sharpeRatio(periodicReturns, periodsPerYear),
    cagr: cagr(initialBalance, finalEquity, candles[0].time, last.time),
    tradesCount: trades.filter(t => typeof t.profit === "number").length,
  };

  // Persist summary (keep metrics in strategy.parameters to avoid schema changes)
  const saved = await Backtest.create({
    userId,
    symbol,
    timeframe,
    initialBalance,
    finalBalance: metrics.finalBalance,
    profit: metrics.netProfit,
    candlesTested: candles.length,
    strategy: { name: strategy, parameters: { feeRate, slippageBps, metrics } },
    tradeBreakdown: trades.filter(t => typeof t.profit === "number"),
  });

  await logToDb(
    userId,
    `[Backtest] ${symbol} ${timeframe} | ${strategy} | P/L: $${metrics.netProfit.toFixed(
      2
    )} | Win%: ${winRate}% | MDD: ${metrics.maxDrawdown}%`
  );

  return {
    saved,
    metrics,
    equityCurve: equityCurve.map(p => ({ time: p.t, equity: p.equity })),
    trades: trades.filter(t => typeof t.profit === "number"),
  };
}
