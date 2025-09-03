// File: backend/services/backtestService.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { logToDb } from "./logService.js";

// Run a single backtest
export async function runBacktest({
  userId,
  symbol,
  timeframe = "1h",
  initialBalance = 1000,
  strategy = { name: "Simple", parameters: {} },
  risk = "Medium",
  takeProfit = null,
  stopLoss = null,
  feeRate = 0.001,
  slippageBps = 5,
  limit = 2000
} = {}) {

  const rows = await Price.find({ symbol }).sort({ timestamp: 1 }).limit(limit);
  if (!rows || rows.length < 2) {
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

  const candles = rows.map(r => ({ time: r.timestamp, price: r.price, raw: r }));
  let balance = initialBalance;
  let asset = 0;
  const trades = [];
  const equityCurve = [];
  const slip = slippageBps / 10000;

  for (let i = 1; i < candles.length; i++) {
    const prevPrice = candles[i - 1].price;
    const curPrice = candles[i].price;

    const decision = curPrice > prevPrice ? "BUY" : "SELL";
    equityCurve.push({ time: candles[i].time, equity: +(balance + asset * curPrice).toFixed(2) });

    if (decision === "BUY" && balance > 0) {
      const spend = balance;
      const fill = curPrice * (1 + slip);
      asset += spend / fill;
      balance = 0;
      trades.push({ entryTime: candles[i].time, entryPrice: fill, position: "long" });
    } else if (asset > 0) {
      const fill = curPrice * (1 - slip);
      const proceeds = asset * fill;
      const openTrade = trades.slice().reverse().find(t => t.entryTime && !t.exitTime);
      const entryPrice = openTrade?.entryPrice ?? curPrice;

      let profit = +(proceeds - asset * entryPrice).toFixed(2);

      const pnlPct = ((fill - entryPrice) / entryPrice) * 100;
      if (takeProfit !== null && pnlPct >= takeProfit) {
        profit = +(asset * entryPrice * (takeProfit / 100)).toFixed(2);
      } else if (stopLoss !== null && pnlPct <= -stopLoss) {
        profit = -(asset * entryPrice * (stopLoss / 100)).toFixed(2);
      }

      trades.push({
        exitTime: candles[i].time,
        exitPrice: fill,
        profit,
        position: "long",
        result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven"
      });

      balance += proceeds;
      asset = 0;
    }
  }

  const lastPrice = candles[candles.length - 1].price;
  equityCurve.push({ time: candles[candles.length - 1].time, equity: +(balance + asset * lastPrice).toFixed(2) });

  const finalBalance = balance + asset * lastPrice;
  const netProfit = +(finalBalance - initialBalance).toFixed(2);
  const wins = trades.filter(t => t.profit > 0).length;
  const losses = trades.filter(t => t.profit < 0).length;
  const winRate = trades.length ? +(100 * wins / (wins + losses || 1)).toFixed(2) : 0;

  let peak = equityCurve[0].equity;
  let maxDd = 0;
  for (const e of equityCurve) {
    if (e.equity > peak) peak = e.equity;
    const dd = (peak - e.equity) / (peak || 1);
    if (dd > maxDd) maxDd = dd;
  }

  const pf = losses === 0 ? (wins > 0 ? Infinity : 0) : +(wins / losses).toFixed(2);

  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    const cur = equityCurve[i].equity;
    returns.push(prev === 0 ? 0 : (cur - prev) / prev);
  }
  const sr = returns.length < 2 ? 0 : +(Math.sqrt(252) * (returns.reduce((a,b)=>a+b,0)/returns.length)/Math.sqrt(returns.reduce((a,b)=>a+Math.pow(b-(returns.reduce((a,b)=>a+b,0)/returns.length),2),0)/(returns.length-1))).toFixed(2);

  const startTime = candles[0].time;
  const endTime = candles[candles.length - 1].time;
  const years = Math.max((endTime - startTime) / (365*24*3600*1000), 1/365);
  const cg = +((Math.pow(finalBalance/initialBalance, 1/years) - 1)*100).toFixed(2);

  const metrics = {
    initialBalance,
    finalBalance: +finalBalance.toFixed(2),
    netProfit,
    winRate,
    maxDrawdown: +(maxDd*100).toFixed(2),
    profitFactor: pf,
    sharpeRatio: sr,
    cagr: cg,
    tradesCount: trades.length
  };

  const saved = await Backtest.create({
    userId,
    symbol,
    timeframe,
    initialBalance,
    finalBalance: metrics.finalBalance,
    profit: metrics.netProfit,
    candlesTested: candles.length,
    strategy,
    tradeBreakdown: trades,
    metrics,
    risk,
    takeProfit,
    stopLoss,
    createdAt: new Date()
  });

  await logToDb(userId, `[Backtest] ${symbol} | TP: ${takeProfit ?? "None"} | SL: ${stopLoss ?? "None"} | Profit: $${netProfit.toFixed(2)} | Trades: ${trades.length}`);

  return { saved, metrics, equityCurve, trades };
}

// Batch support
export async function runBatchBacktests(userId, exchange, paramCombos) {
  const results = [];
  let best = null;

  for (const combo of paramCombos) {
    const { saved, metrics } = await runBacktest({ userId, ...combo });
    results.push({ saved, metrics });
    if (!best || (metrics.netProfit > best.metrics.netProfit)) best = { saved, metrics };
  }

  return { results, best };
}

// Alias for botService import
export const runRealisticBacktest = runBacktest;
