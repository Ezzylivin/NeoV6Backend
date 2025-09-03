// File: backend/services/backtestService.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { logToDb } from "./logService.js";

/**
 * Simple strategy helpers (mocked rules for demo)
 */
function executeStrategy(strategyName, candles, i, parameters = {}) {
  // Currently only simple SMA crossover example
  if (strategyName === "SMA") {
    const period = parameters.period || 3;
    if (i < period) return null;

    const sma = candles.slice(i - period, i).reduce((sum, c) => sum + c.price, 0) / period;
    return candles[i].price > sma ? "BUY" : "SELL";
  }

  // Default: buy if price increased, sell if decreased
  return candles[i].price > candles[i - 1].price ? "BUY" : "SELL";
}

/**
 * Run a single backtest with strategy integration
 */
export async function runBacktest({
  userId,
  strategyId = null, // NEW: optional Strategy document ID
  symbol,
  timeframe = "1h",
  initialBalance = 1000,
  strategy = { name: "SMA", parameters: {} },
  risk = "Medium",
  takeProfit = null,
  stopLoss = null,
  feeRate = 0.001,
  slippageBps = 5,
  limit = 2000
} = {}) {

  // --- Load strategy from DB if strategyId is provided ---
  if (strategyId) {
    const stratDoc = await Strategy.findById(strategyId);
    if (stratDoc) {
      symbol = symbol || stratDoc.params.symbol;
      timeframe = timeframe || stratDoc.params.timeframe;
      initialBalance = initialBalance || stratDoc.params.initialBalance;
      strategy = { 
        name: stratDoc.params.strategyType || "SMA", 
        parameters: stratDoc.params 
      };
      risk = risk || stratDoc.params.risk;
      takeProfit = takeProfit != null ? takeProfit : stratDoc.params.takeProfit;
      stopLoss = stopLoss != null ? stopLoss : stratDoc.params.stopLoss;
    }
  }

  if (!userId || !symbol || !strategy?.name) {
    throw new Error("Missing required fields: userId, symbol, or strategy.name");
  }

  console.log("[RunBacktest Payload]", { userId, symbol, timeframe, initialBalance, strategy, risk, takeProfit, stopLoss });

  // --- Fetch historical prices safely ---
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

  try {
    for (let i = 1; i < candles.length; i++) {
      const curPrice = candles[i].price;
      const decision = executeStrategy(strategy.name, candles, i, strategy.parameters);

      equityCurve.push({ time: candles[i].time, equity: +(balance + asset * curPrice).toFixed(2) });

      // Execute BUY
      if (decision === "BUY" && balance > 0) {
        const spend = balance;
        const fillPrice = curPrice * (1 + slip);
        asset += spend / fillPrice;
        balance = 0;
        trades.push({ entryTime: candles[i].time, entryPrice: fillPrice, position: "long" });
      }

      // Execute SELL
      if (asset > 0 && (decision === "SELL" || i === candles.length - 1)) {
        const fillPrice = curPrice * (1 - slip);
        const proceeds = asset * fillPrice;
        const openTrade = trades.slice().reverse().find(t => t.entryTime && !t.exitTime);
        const entryPrice = openTrade?.entryPrice ?? curPrice;

        let profit = +(proceeds - asset * entryPrice).toFixed(2);
        const pnlPct = ((fillPrice - entryPrice) / entryPrice) * 100;

        if (takeProfit != null && pnlPct >= takeProfit) {
          profit = +(asset * entryPrice * (takeProfit / 100)).toFixed(2);
        } else if (stopLoss != null && pnlPct <= -stopLoss) {
          profit = -(asset * entryPrice * (stopLoss / 100)).toFixed(2);
        }

        trades.push({
          exitTime: candles[i].time,
          exitPrice: fillPrice,
          profit,
          position: "long",
          result: profit > 0 ? "win" : profit < 0 ? "loss" : "breakeven"
        });

        balance += proceeds;
        asset = 0;
      }
    }
  } catch (err) {
    console.error("[Backtest Calculation Error]", err, { userId, symbol });
    throw new Error("Error during backtest calculation");
  }

  // Final equity push
  const lastPrice = candles[candles.length - 1].price;
  equityCurve.push({ time: candles[candles.length - 1].time, equity: +(balance + asset * lastPrice).toFixed(2) });

  // --- Metrics ---
  let finalBalance = balance + asset * lastPrice;
  if (isNaN(finalBalance)) finalBalance = initialBalance;

  let netProfit = +(finalBalance - initialBalance).toFixed(2);
  if (isNaN(netProfit)) netProfit = 0;

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
  const sr = returns.length < 2 ? 0 : +(Math.sqrt(252) * (returns.reduce((a, b) => a + b, 0) / returns.length) /
    Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - (returns.reduce((a, b) => a + b, 0) / returns.length), 2), 0) / (returns.length - 1))).toFixed(2);

  const startTime = candles[0].time;
  const endTime = candles[candles.length - 1].time;
  const years = Math.max((endTime - startTime) / (365 * 24 * 3600 * 1000), 1 / 365);
  const cagr = +((Math.pow(finalBalance / initialBalance, 1 / years) - 1) * 100).toFixed(2);

  const metrics = {
    initialBalance,
    finalBalance: +finalBalance.toFixed(2),
    netProfit,
    winRate,
    maxDrawdown: +(maxDd * 100).toFixed(2),
    profitFactor: pf,
    sharpeRatio: sr,
    cagr,
    tradesCount: trades.length
  };

  // --- Save to DB ---
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

  await logToDb(userId, `[Backtest] ${symbol} | TP: ${takeProfit ?? 0}% | SL: ${stopLoss ?? 0}% | Profit: $${netProfit.toFixed(2)} | Trades: ${trades.length}`);

  return { saved, metrics, equityCurve, trades };
}

/**
 * Run multiple backtests in batch safely
 */
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

export const runRealisticBacktest = runBacktest;
