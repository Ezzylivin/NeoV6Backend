import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// --- Utility: calculate metrics (no changes) ---
const calculateMetrics = (trades, initialBalance = 1000) => {
  if (!trades || trades.length === 0) return { totalProfit: 0, totalTrades: 0, winRate: 0, maxDrawdown: 0, equityCurve: [], tradeHistory: [] };
  let equity = 0, equityCurve = [], wins = 0, losses = 0, totalProfit = 0, maxDrawdown = 0, peak = 0;
  trades.forEach(trade => {
    equity += trade.profit || 0;
    equityCurve.push({ timestamp: trade.timestamp || trade.entryTimestamp, balance: initialBalance + equity });
    if (equity > peak) peak = equity;
    else { const dd = peak - equity; if (dd > maxDrawdown) maxDrawdown = dd; }
    if (trade.profit > 0) wins++; else losses++;
    totalProfit += trade.profit || 0;
  });
  const winRate = trades.length ? wins / trades.length : 0;
  return { totalProfit, totalTrades: trades.length, winRate, maxDrawdown, equityCurve, tradeHistory: trades };
};

// --- Save a new strategy (no changes) ---
export const saveStrategyService = async (userId, strategyData) => {
  return Strategy.create({ userId, ...strategyData });
};

// --- Get all strategies for a user (no changes) ---
export const getStrategiesService = async (userId) => {
  return Strategy.find({ userId }).select("_id name code params").lean();
};

// --- Run strategy (single) (no changes) ---
export const runStrategyService = async (dbStrategy, params = {}, userId, simulateOnly = true) => {
  if (!dbStrategy) throw new Error("Strategy object is required.");
  if (dbStrategy.userId.toString() !== userId.toString()) throw new Error("Not authorized.");

  const { symbol, timeframe, startDate, endDate, tp, sl } = params;
  const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);
  if (!candles) throw new Error("Could not fetch market data.");

  const strategyFunction = getStrategy(dbStrategy.params.strategyType);
  const trades = strategyFunction(candles, dbStrategy.params);
  const metrics = calculateMetrics(trades, dbStrategy.params.initialBalance || 1000);
  const finalBalance = (dbStrategy.params.initialBalance || 1000) + (metrics.totalProfit || 0);

  if (!simulateOnly) {
    const backtestData = {
      userId, symbol, timeframe,
      initialBalance: dbStrategy.params.initialBalance || 1000,
      finalBalance,
      startDate: startDate || new Date(candles[0][0]),
      endDate: endDate || new Date(candles[candles.length - 1][0]),
      takeProfit: tp, stopLoss: sl,
      candlesTested: candles.length,
      strategy: { name: dbStrategy.name, type: dbStrategy.params.strategyType, params: dbStrategy.params, code: dbStrategy.code },
      tradeBreakdown: trades,
      equityCurve: metrics.equityCurve,
      metrics
    };
    return await Backtest.create(backtestData);
  }
  return { trades, metrics, strategyName: dbStrategy.name, symbol, timeframe, code: dbStrategy.code };
};


// ✅ --- NEW: Run a combined strategy backtest ---
export const runCombinedStrategyService = async (userId, comboPayload) => {
  const { strategyCodes, combinationRule, symbol, timeframe, startDate, endDate, initialBalance = 1000 } = comboPayload;

  // 1. Fetch all selected strategies
  const dbStrategies = await Strategy.find({ userId, code: { $in: strategyCodes } }).lean();
  if (dbStrategies.length !== strategyCodes.length) throw new Error("One or more strategies not found.");

  // 2. Fetch market data
  const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);
  if (!candles) throw new Error("Could not fetch market data.");

  // 3. Generate individual signals for each strategy
  const strategySignals = dbStrategies.map(dbStrategy => {
    const strategyFunction = getStrategy(dbStrategy.params.strategyType);
    return strategyFunction(candles, dbStrategy.params).map(trade => ({ timestamp: trade.entryTimestamp, signal: trade.signal }));
  });

  // 4. Combine signals and generate final trades
  const combinedTrades = [];
  let position = null;

  for (let i = 0; i < candles.length; i++) {
    const timestamp = candles[i][0];
    const currentSignals = strategySignals.map(signals => {
      const foundSignal = signals.find(s => s.timestamp === timestamp);
      return foundSignal ? foundSignal.signal : 'hold';
    });
    
    const finalSignal = applyCombinationRule(currentSignals, combinationRule);
    
    if (finalSignal === 'buy' && !position) {
      position = 'long';
      combinedTrades.push({ signal: 'buy', entryTimestamp: timestamp, entryPrice: candles[i][4] });
    } else if (finalSignal === 'sell' && position === 'long') {
      const entryTrade = combinedTrades[combinedTrades.length - 1];
      entryTrade.exitTimestamp = timestamp;
      entryTrade.exitPrice = candles[i][4];
      entryTrade.profit = entryTrade.exitPrice - entryTrade.entryPrice;
      position = null;
    }
  }

  // 5. Calculate metrics and return results
  const metrics = calculateMetrics(combinedTrades, initialBalance);
  return {
    trades: combinedTrades,
    metrics,
    info: { combinationRule, strategies: dbStrategies.map(s => s.name) },
    symbol,
    timeframe,
  };
};

// ✅ --- NEW: Helper to apply the combination logic ---
function applyCombinationRule(signals, rule) {
  if (rule === 'AND') {
    if (signals.every(s => s === 'buy')) return 'buy';
    if (signals.every(s => s === 'sell')) return 'sell';
  } else if (rule === 'OR') {
    if (signals.some(s => s === 'buy')) return 'buy';
    if (signals.some(s => s === 'sell')) return 'sell';
  }
  return 'hold';
}


// --- Existing helper functions (no changes) ---
export const runBatchBacktestsService = async (dbStrategy, batchParams, userId) => {
  const results = [];
  for (const params of batchParams) {
    const res = await runStrategyService(dbStrategy, params, userId, false);
    results.push(res);
  }
  return results;
};
export const runBacktestService = async (dbStrategy, params, userId, previewOnly = true) => {
  return runStrategyService(dbStrategy, params, userId, !previewOnly);
};
