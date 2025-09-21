// File: services/strategyEngineService.js
// UPGRADED: The engine now correctly filters market data based on the user's selected date range.

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// --- Metrics Calculation Utility (no changes) ---
const calculateMetrics = (trades, initialBalance = 1000) => {
    if (!trades || trades.length === 0) return { metrics: { totalTrades: 0, winRate: 0, totalProfit: 0, finalBalance: initialBalance }, equityCurve: [{ timestamp: new Date(), balance: initialBalance }], tradeHistory: [] };
    let balance = initialBalance;
    const equityCurve = [{ timestamp: trades[0].entryTime || new Date(), balance: initialBalance }];
    let peakBalance = initialBalance; let maxDrawdown = 0;
    let winningTrades = 0, losingTrades = 0, totalProfit = 0;
    let totalWinAmount = 0, totalLossAmount = 0;
    let largestWin = 0, largestLoss = 0;
    const closedTrades = [];
    for (const trade of trades) {
        if (trade.exitTime && trade.exitPrice) {
            trade.duration = trade.exitTime.getTime() - trade.entryTime.getTime();
            balance += trade.profit;
            if (balance <= 0) { balance = 0; equityCurve.push({ timestamp: trade.exitTime, balance }); closedTrades.push(trade); break; }
            if (trade.profit > 0) { trade.result = 'win'; winningTrades++; totalWinAmount += trade.profit; if (trade.profit > largestWin) largestWin = trade.profit; } 
            else { trade.result = 'loss'; losingTrades++; totalLossAmount += Math.abs(trade.profit); if (trade.profit < largestLoss) largestLoss = trade.profit; }
            equityCurve.push({ timestamp: trade.exitTime, balance });
            if (balance > peakBalance) peakBalance = balance;
            const drawdown = ((peakBalance - balance) / peakBalance) * 100;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
            totalProfit += trade.profit;
            closedTrades.push(trade);
        } else { trade.result = 'open'; }
    }
    const totalClosedTrades = closedTrades.length;
    const winRate = totalClosedTrades > 0 ? (winningTrades / totalClosedTrades) * 100 : 0;
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : 0;
    const metrics = {
        totalReturn: (totalProfit / initialBalance) * 100, winRate, totalTrades: totalClosedTrades,
        winningTrades, losingTrades, maxDrawdown, profitFactor,
        averageWin: winningTrades > 0 ? totalWinAmount / winningTrades : 0,
        averageLoss: losingTrades > 0 ? totalLossAmount / losingTrades : 0,
        largestWin, largestLoss, totalProfit, finalBalance: balance,
    };
    return { metrics, equityCurve, tradeHistory: trades };
};

// --- Run a single strategy backtest ---
export const runStrategyService = async (dbStrategy, params = {}, userId, simulateOnly = true) => {
    if (!dbStrategy) throw new Error("Strategy object is required.");
    if (dbStrategy.userId.toString() !== userId.toString()) throw new Error("Not authorized.");

    const { symbol, timeframe, startDate, endDate, initialBalance = 1000 } = params;
    const { candles: allCandles } = await fetchOHLCVMultiSafe(symbol, timeframe);

    // ✅ FIXED: Filter the candles based on the provided date range.
    const candles = allCandles.filter(c => {
        const timestamp = new Date(c[0]);
        return timestamp >= new Date(startDate) && timestamp <= new Date(endDate);
    });

    if (!candles || candles.length < 1) {
        console.warn(`No market data found for ${symbol} in the selected date range.`);
        const { metrics, equityCurve, tradeHistory } = calculateMetrics([], initialBalance);
        return { trades: tradeHistory, metrics, equityCurve, strategy: { name: dbStrategy.name } };
    }

    const strategyFunction = getStrategy(dbStrategy.params.strategyType);
    const trades = strategyFunction(candles, dbStrategy.params);
    const { metrics, equityCurve, tradeHistory } = calculateMetrics(trades, initialBalance);

    if (!simulateOnly) {
        const backtestData = {
            userId, symbol, timeframe, initialBalance,
            finalBalance: metrics.finalBalance, profit: metrics.totalProfit,
            totalTrades: metrics.totalTrades, candlesTested: candles.length,
            strategy: { name: dbStrategy.name, type: dbStrategy.params.strategyType, parameters: dbStrategy.params },
            tradeBreakdown: tradeHistory, equityCurve, metrics,
            startDate, endDate,
        };
        return await Backtest.create(backtestData);
    }
    return { trades: tradeHistory, metrics, equityCurve, strategyName: dbStrategy.name, symbol, timeframe };
};

// --- Run a combined strategy backtest ---
export const runCombinedStrategyService = async (userId, comboPayload) => {
  const { strategyCodes, combinationRule, symbol, timeframe, startDate, endDate, initialBalance = 1000 } = comboPayload;

  const dbStrategies = await Strategy.find({ userId, code: { $in: strategyCodes } }).lean();
  if (dbStrategies.length !== strategyCodes.length) throw new Error("One or more strategies not found.");

  const { candles: allCandles } = await fetchOHLCVMultiSafe(symbol, timeframe);
  
  // ✅ FIXED: Filter candles for the combo test as well.
  const candles = allCandles.filter(c => {
      const timestamp = new Date(c[0]);
      return timestamp >= new Date(startDate) && timestamp <= new Date(endDate);
  });
  
  if (!candles || candles.length < 1) {
      console.warn(`No market data found for ${symbol} in the selected date range for combo test.`);
      const { metrics, equityCurve } = calculateMetrics([], initialBalance);
      return {
          combinedResult: { metrics, equityCurve },
          individualResults: dbStrategies.map(dbStrategy => ({
              strategyName: dbStrategy.name,
              metrics,
              equityCurve,
          }))
      };
  }

  const individualResults = dbStrategies.map(dbStrategy => {
      const strategyFunction = getStrategy(dbStrategy.params.strategyType);
      const trades = strategyFunction(candles, dbStrategy.params);
      const { metrics, equityCurve } = calculateMetrics(trades, initialBalance);
      return { strategyName: dbStrategy.name, metrics, equityCurve };
  });

  const strategySignals = dbStrategies.map(dbStrategy => {
    const strategyFunction = getStrategy(dbStrategy.params.strategyType);
    return strategyFunction(candles, dbStrategy.params).map(trade => ({ timestamp: trade.entryTime.getTime(), signal: trade.signal }));
  });

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
      combinedTrades.push({ entryTime: new Date(timestamp), entryPrice: candles[i][4], signal: 'buy', position: 'long', size: 1 });
    } else if (finalSignal === 'sell' && position === 'long') {
      const entryTrade = combinedTrades[combinedTrades.length - 1];
      entryTrade.exitTime = new Date(timestamp);
      entryTrade.exitPrice = candles[i][4];
      entryTrade.profit = (entryTrade.exitPrice - entryTrade.entryPrice) * entryTrade.size;
      position = null;
    }
  }
  const { metrics: combinedMetrics, equityCurve: combinedEquityCurve } = calculateMetrics(combinedTrades, initialBalance);
  return {
    combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve },
    individualResults
  };
};

// --- Other functions (no changes) ---
function applyCombinationRule(signals, rule) {
  if (rule === 'AND') {
    if (signals.length > 0 && signals.every(s => s === 'buy')) return 'buy';
    if (signals.length > 0 && signals.every(s => s === 'sell')) return 'sell';
  } else if (rule === 'OR') {
    if (signals.some(s => s === 'buy')) return 'buy';
    if (signals.some(s => s === 'sell')) return 'sell';
  }
  return 'hold';
}
export const getStrategiesService = async (userId) => {
  return Strategy.find({ userId }).select("_id name code params").lean();
};
export const saveStrategyService = async (userId, strategyData) => {
    return Strategy.create({ userId, ...strategyData });
};

