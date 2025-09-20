// File: services/strategyEngineService.js
// UPGRADED: This service is now fully compliant with the detailed backtest database schema.

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// --- ✅ UPGRADED: Full-featured metrics calculation utility ---
const calculateMetrics = (trades, initialBalance = 1000) => {
    if (!trades || trades.length === 0) {
        return { 
            metrics: { totalTrades: 0, winRate: 0 }, 
            equityCurve: [], 
            tradeHistory: [] 
        };
    }

    let balance = initialBalance;
    const equityCurve = [{ timestamp: trades[0].entryTime, balance: initialBalance }];
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
    };

    return { metrics, equityCurve, tradeHistory: trades };
};


// --- Run strategy (single) ---
export const runStrategyService = async (dbStrategy, params = {}, userId, simulateOnly = true) => {
    if (!dbStrategy) throw new Error("Strategy object is required.");
    if (dbStrategy.userId.toString() !== userId.toString()) throw new Error("Not authorized.");

    const { symbol, timeframe, startDate, endDate } = params;
    const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);
    if (!candles || candles.length < 1) throw new Error("Could not fetch market data.");

    const strategyFunction = getStrategy(dbStrategy.params.strategyType);
    const trades = strategyFunction(candles, dbStrategy.params);
    
    const { metrics, equityCurve, tradeHistory } = calculateMetrics(trades, params.initialBalance || 1000);
    const finalBalance = initialBalance + (metrics.totalProfit || 0);

    if (!simulateOnly) {
        const backtestData = {
            userId,
            symbol,
            timeframe,
            initialBalance: params.initialBalance || 1000,
            finalBalance,
            profit: metrics.totalProfit,
            totalTrades: metrics.totalTrades,
            candlesTested: candles.length,
            strategy: {
                name: dbStrategy.name,
                type: dbStrategy.params.strategyType,
                parameters: dbStrategy.params, // ✅ FIXED: Key is now 'parameters'
            },
            tradeBreakdown: tradeHistory, // ✅ FIXED: Use the processed trades
            equityCurve: equityCurve,   // ✅ FIXED: Use the processed equity curve
            metrics: metrics,           // ✅ FIXED: Use the full metrics object
            startDate: startDate || new Date(candles[0][0]),
            endDate: endDate || new Date(candles[candles.length - 1][0]),
            // ...other fields will use defaults from the schema
        };
        const savedBacktest = await Backtest.create(backtestData);
        return savedBacktest;
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

// --- Other service functions ---
// (No changes needed for these)
export const getStrategiesService = async (userId) => {
  return Strategy.find({ userId }).select("_id name code params").lean();
};
