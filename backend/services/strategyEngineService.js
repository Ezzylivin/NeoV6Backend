// File: services/strategyEngineService.js
// UPGRADED: Includes SL/TP support for single and combined strategies

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// --- Full-featured metrics calculation with risk management ---
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

    for (const trade of trades) {
        if (trade.exitTime && trade.exitPrice != null) {
            trade.duration = trade.exitTime.getTime() - trade.entryTime.getTime();
            balance += trade.profit;

            if (balance <= 0) {
                balance = 0;
                equityCurve.push({ timestamp: trade.exitTime, balance });
                closedTrades.push(trade);
                break;
            }

            if (trade.profit > 0) {
                trade.result = 'win'; winningTrades++; totalWinAmount += trade.profit;
                if (trade.profit > largestWin) largestWin = trade.profit;
            } else {
                trade.result = 'loss'; losingTrades++; totalLossAmount += Math.abs(trade.profit);
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

// --- Run a single strategy backtest with SL/TP support ---
export const runStrategyService = async (dbStrategy, params = {}, userId, simulateOnly = true) => {
    if (!dbStrategy) throw new Error("Strategy object is required.");
    if (dbStrategy.userId.toString() !== userId.toString()) throw new Error("Not authorized.");

    const { symbol, timeframe, startDate, endDate, initialBalance = 1000, stopLoss = 0.02, takeProfit = 0.05 } = params;
    const { candles: allCandles, message: noTradeMessage } = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);

    const candles = allCandles.filter(c => {
        const timestamp = new Date(c[0]);
        return timestamp >= new Date(startDate) && timestamp <= new Date(endDate);
    });

    let trades = [];
    let strategyNoTradeReason = null;

    if (!candles || candles.length < 1) {
        console.warn(`No market data found for ${symbol} in the selected date range.`);
        strategyNoTradeReason = noTradeMessage;
    } else {
        const strategyFunction = getStrategy(dbStrategy.params.strategyType);
        const signals = strategyFunction(candles, dbStrategy.params);

        // Apply SL/TP per trade
        let position = null;
        for (let i = 0; i < candles.length; i++) {
            const ts = candles[i][0];
            const open = candles[i][1];
            const high = candles[i][2];
            const low = candles[i][3];
            const close = candles[i][4];

            const signal = signals.find(s => s.entryTime.getTime() === ts);
            if (!position && signal && signal.signal === 'buy') {
                position = { entryTime: new Date(ts), entryPrice: close, size: 1, SL: close * (1 - stopLoss), TP: close * (1 + takeProfit) };
                trades.push(position);
            }

            if (position) {
                if (low <= position.SL) {
                    position.exitTime = new Date(ts);
                    position.exitPrice = position.SL;
                    position.profit = (position.exitPrice - position.entryPrice) * position.size;
                    position.result = 'loss';
                    position = null;
                    continue;
                }
                if (high >= position.TP) {
                    position.exitTime = new Date(ts);
                    position.exitPrice = position.TP;
                    position.profit = (position.exitPrice - position.entryPrice) * position.size;
                    position.result = 'win';
                    position = null;
                    continue;
                }
                if (signal && signal.signal === 'sell') {
                    position.exitTime = new Date(ts);
                    position.exitPrice = close;
                    position.profit = (position.exitPrice - position.entryPrice) * position.size;
                    position.result = position.profit >= 0 ? 'win' : 'loss';
                    position = null;
                }
            }
        }

        if (!trades || trades.length === 0) {
            strategyNoTradeReason = `Strategy conditions were never met: ${dbStrategy.params.strategyType}`;
        }
    }

    const { metrics, equityCurve, tradeHistory } = calculateMetrics(trades, initialBalance);

    if (!simulateOnly) {
        const backtestData = {
            userId, symbol, timeframe, initialBalance,
            finalBalance: metrics.finalBalance, profit: metrics.totalProfit,
            totalTrades: metrics.totalTrades, candlesTested: candles.length,
            strategy: { name: dbStrategy.name, type: dbStrategy.params.strategyType, parameters: dbStrategy.params },
            tradeBreakdown: tradeHistory, equityCurve, metrics,
            startDate, endDate,
            noTradeReason: strategyNoTradeReason
        };
        return await Backtest.create(backtestData);
    }

    return { trades: tradeHistory, metrics, equityCurve, strategyName: dbStrategy.name, symbol, timeframe, noTradeReason: strategyNoTradeReason };
};

// --- Run a combined strategy backtest with SL/TP support ---
export const runCombinedStrategyService = async (userId, comboPayload) => {
    const { strategyCodes, combinationRule, symbol, timeframe, startDate, endDate, initialBalance = 1000, stopLoss = 0.02, takeProfit = 0.05 } = comboPayload;

    const dbStrategies = await Strategy.find({ userId, code: { $in: strategyCodes } }).lean();
    if (dbStrategies.length !== strategyCodes.length) throw new Error("One or more strategies not found.");

    const { candles: allCandles, message: noTradeMessage } = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);

    const candles = allCandles.filter(c => {
        const timestamp = new Date(c[0]);
        return timestamp >= new Date(startDate) && timestamp <= new Date(endDate);
    });

    const individualResults = dbStrategies.map(dbStrategy => {
        let trades = [];
        let strategyNoTradeReason = null;

        if (!candles || candles.length < 1) {
            strategyNoTradeReason = noTradeMessage;
        } else {
            const strategyFunction = getStrategy(dbStrategy.params.strategyType);
            trades = strategyFunction(candles, dbStrategy.params);

            if (!trades || trades.length === 0) {
                strategyNoTradeReason = `Strategy conditions never triggered: ${dbStrategy.params.strategyType}`;
            }
        }

        const { metrics, equityCurve } = calculateMetrics(trades, initialBalance);
        return { strategyName: dbStrategy.name, metrics, equityCurve, noTradeReason: strategyNoTradeReason };
    });

    const strategySignals = dbStrategies.map(dbStrategy => {
        const strategyFunction = getStrategy(dbStrategy.params.strategyType);
        return strategyFunction(candles, dbStrategy.params).map(trade => ({ timestamp: trade.entryTime.getTime(), signal: trade.signal }));
    });

    const combinedTrades = [];
    let position = null;

    for (let i = 0; i < candles.length; i++) {
        const ts = candles[i][0];
        const open = candles[i][1];
        const high = candles[i][2];
        const low = candles[i][3];
        const close = candles[i][4];

        const currentSignals = strategySignals.map(signals => {
            const found = signals.find(s => s.timestamp === ts);
            return found ? found.signal : 'hold';
        });
        const finalSignal = applyCombinationRule(currentSignals, combinationRule);

        if (!position && finalSignal === 'buy') {
            position = { entryTime: new Date(ts), entryPrice: close, size: 1, SL: close * (1 - stopLoss), TP: close * (1 + takeProfit), signal: 'buy', position: 'long' };
            combinedTrades.push(position);
        }

        if (position) {
            if (low <= position.SL) {
                position.exitTime = new Date(ts);
                position.exitPrice = position.SL;
                position.profit = (position.exitPrice - position.entryPrice) * position.size;
                position.result = 'loss';
                position = null;
                continue;
            }
            if (high >= position.TP) {
                position.exitTime = new Date(ts);
                position.exitPrice = position.TP;
                position.profit = (position.exitPrice - position.entryPrice) * position.size;
                position.result = 'win';
                position = null;
                continue;
            }
            if (finalSignal === 'sell') {
                position.exitTime = new Date(ts);
                position.exitPrice = close;
                position.profit = (position.exitPrice - position.entryPrice) * position.size;
                position.result = position.profit >= 0 ? 'win' : 'loss';
                position = null;
            }
        }
    }

    const { metrics: combinedMetrics, equityCurve: combinedEquityCurve } = calculateMetrics(combinedTrades, initialBalance);

    return {
        combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve, trades: combinedTrades },
        individualResults
    };
};

// --- Helper to apply the combination logic ---
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

// --- Other required service functions ---
export const getStrategiesService = async (userId) => {
    return Strategy.find({ userId }).select("_id name code params").lean();
};

export const saveStrategyService = async (userId, strategyData) => {
    return Strategy.create({ userId, ...strategyData });
};
