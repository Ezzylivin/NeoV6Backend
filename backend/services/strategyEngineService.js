// File: services/strategyEngineService.js
// UPGRADED: This service is now fully compliant with the detailed backtest database schema and includes all necessary functions.

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// --- ✅ UPGRADED: Full-featured metrics calculation utility ---
const calculateMetrics = (trades, initialBalance = 1000) => {
    if (!trades || trades.length === 0) {
        return { 
            metrics: { totalTrades: 0, winRate: 0, totalProfit: 0, finalBalance: initialBalance }, 
            equityCurve: [{ timestamp: new Date(), balance: initialBalance }], 
            tradeHistory: [] 
        };
    }

    let balance = initialBalance;
    const equityCurve = [{ timestamp: trades[0].entryTime || new Date(), balance: initialBalance }];
    let peakBalance = initialBalance;
    let maxDrawdown = 0;

    let winningTrades = 0, losingTrades = 0, totalProfit = 0;
    let totalWinAmount = 0, totalLossAmount = 0;
    let largestWin = 0, largestLoss = 0;
    
    const closedTrades = [];

    trades.forEach(trade => {
        if (trade.exitTime && trade.exitPrice) {
            trade.duration = trade.exitTime.getTime() - trade.entryTime.getTime();
            balance += trade.profit;
            
            if (trade.profit > 0) {
                trade.result = 'win';
                winningTrades++;
                totalWinAmount += trade.profit;
                if (trade.profit > largestWin) largestWin = trade.profit;
            } else {
                trade.result = 'loss';
                losingTrades++;
                totalLossAmount += Math.abs(trade.profit);
                if (trade.profit < largestLoss) largestLoss = trade.profit;
            }
            
            equityCurve.push({ timestamp: trade.exitTime, balance });
            
            if (balance > peakBalance) peakBalance = balance;
            const drawdown = ((peakBalance - balance) / peakBalance) * 100;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
            
            totalProfit += trade.profit;
            closedTrades.push(trade);
        } else {
            trade.result = 'open';
        }
    });

    const totalClosedTrades = closedTrades.length;
    const winRate = totalClosedTrades > 0 ? (winningTrades / totalClosedTrades) * 100 : 0;
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : 0;
    
    const metrics = {
        totalReturn: (totalProfit / initialBalance) * 100,
        winRate,
        totalTrades: totalClosedTrades,
        winningTrades,
        losingTrades,
        maxDrawdown,
        profitFactor,
        averageWin: winningTrades > 0 ? totalWinAmount / winningTrades : 0,
        averageLoss: losingTrades > 0 ? totalLossAmount / losingTrades : 0,
        largestWin,
        largestLoss,
        totalProfit,
        finalBalance: balance,
    };

    return { metrics, equityCurve, tradeHistory: trades };
};

// --- Run strategy (single) ---
export const runStrategyService = async (dbStrategy, params = {}, userId, simulateOnly = true) => {
    if (!dbStrategy) throw new Error("Strategy object is required.");
    if (dbStrategy.userId.toString() !== userId.toString()) throw new Error("Not authorized.");

    const { symbol, timeframe, startDate, endDate, initialBalance = 1000 } = params;
    const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);
    if (!candles || candles.length < 1) throw new Error(`Could not fetch market data for ${symbol}.`);

    const strategyFunction = getStrategy(dbStrategy.params.strategyType);
    const trades = strategyFunction(candles, dbStrategy.params);
    
    const { metrics, equityCurve, tradeHistory } = calculateMetrics(trades, initialBalance);

    if (!simulateOnly) {
        const backtestData = {
            userId,
            symbol,
            timeframe,
            initialBalance,
            finalBalance: metrics.finalBalance,
            profit: metrics.totalProfit,
            totalTrades: metrics.totalTrades,
            candlesTested: candles.length,
            strategy: {
                name: dbStrategy.name,
                type: dbStrategy.params.strategyType,
                parameters: dbStrategy.params,
            },
            tradeBreakdown: tradeHistory,
            equityCurve: equityCurve,
            metrics: metrics,
            startDate: startDate || new Date(candles[0][0]),
            endDate: endDate || new Date(candles[candles.length - 1][0]),
        };
        return await Backtest.create(backtestData);
    }

    // Return a simplified preview
    return { 
      trades: tradeHistory, 
      metrics, 
      equityCurve,
      strategyName: dbStrategy.name, 
      symbol, 
      timeframe 
    };
};

// --- ✅ ADDED: Run a combined strategy backtest ---
export const runCombinedStrategyService = async (userId, comboPayload) => {
  const { strategyCodes, combinationRule, symbol, timeframe, startDate, endDate, initialBalance = 1000 } = comboPayload;

  const dbStrategies = await Strategy.find({ userId, code: { $in: strategyCodes } }).lean();
  if (dbStrategies.length !== strategyCodes.length) throw new Error("One or more strategies not found.");

  const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);
  if (!candles || candles.length < 1) throw new Error(`Could not fetch market data for ${symbol}.`);

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

  const { metrics, equityCurve } = calculateMetrics(combinedTrades, initialBalance);
  return {
    metrics,
    equityCurve,
    info: { combinationRule, strategies: dbStrategies.map(s => s.name) },
    symbol,
    timeframe,
  };
};

// --- ✅ ADDED: Helper to apply the combination logic ---
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

// --- Other service functions ---
export const getStrategiesService = async (userId) => {
  return Strategy.find({ userId }).select("_id name code params").lean();
};

export const saveStrategyService = async (userId, strategyData) => {
    return Strategy.create({ userId, ...strategyData });
};

