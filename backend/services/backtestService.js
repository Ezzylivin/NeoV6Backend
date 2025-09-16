// File: src/backend/services/backtestService.js
import Backtest from "../dbStructure/backtest.js";

const calculateMetrics = (trades) => {
  if (!trades || trades.length === 0) return {};

  let equity = 0, equityCurve = [], wins = 0, losses = 0, totalProfit = 0;
  let maxDrawdown = 0, peak = 0, drawdownDuration = 0, currentDrawdownDuration = 0;

  trades.forEach(trade => {
    equity += trade.profit;
    equityCurve.push({ time: trade.timestamp, equity });

    if (equity > peak) {
      peak = equity;
      currentDrawdownDuration = 0;
    } else {
      const dd = peak - equity;
      if (dd > maxDrawdown) maxDrawdown = dd;
      currentDrawdownDuration++;
      if (currentDrawdownDuration > drawdownDuration) drawdownDuration = currentDrawdownDuration;
    }

    if (trade.profit > 0) wins++;
    else losses++;

    totalProfit += trade.profit;
  });

  const avgTrade = totalProfit / trades.length || 0;
  const winRate = trades.length ? wins / trades.length : 0;
  const avgWin = wins ? trades.filter(t => t.profit > 0).reduce((a,b)=>a+b.profit,0)/wins : 0;
  const avgLoss = losses ? trades.filter(t => t.profit <= 0).reduce((a,b)=>a+b.profit,0)/losses : 0;
  const profitFactor = Math.abs(avgWin / (avgLoss || 1)) || 0;
  const sharpeRatio = (trades.reduce((a,b)=>a+b.profit,0)/trades.length || 0) / 
                      (Math.sqrt(trades.reduce((a,b)=>a+Math.pow(b.profit,2),0)/trades.length) || 1);

  return { totalProfit, totalTrades: trades.length, winRate, avgTrade, avgWin, avgLoss, profitFactor, maxDrawdown, drawdownDuration, sharpeRatio, equityCurve, tradeHistory: trades };
};

export const runBacktest = async ({ userId, strategy, symbol, timeframe, startDate, endDate, tp, sl, simulateOnly }) => {
  // placeholder trades (replace with real backtest)
  const trades = [
    { timestamp: startDate, profit: 50 },
    { timestamp: new Date(), profit: -20 },
    { timestamp: new Date(), profit: 30 },
  ];

  const metrics = calculateMetrics(trades);

  if (!simulateOnly) {
    const saved = await Backtest.create({
      userId,
      strategyName: strategy,
      symbol,
      timeframe,
      startDate,
      endDate,
      tp,
      sl,
      trades,
      metrics,
    });
    return saved;
  }

  return { strategyName: strategy, symbol, timeframe, startDate, endDate, tp, sl, metrics };
};

export const runBatchBacktests = async (userId, configs) => {
  const results = [];
  for (const cfg of configs.slice(0,50)) {
    const res = await runBacktest({ userId, ...cfg });
    results.push(res);
  }
  return results;
};
