// File: services/backtest.js
// REAL BACKTEST ENGINE
// UPGRADED: Re-architected as a chronological simulator with dynamic risk management.

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";

/**
 * A comprehensive, event-driven backtesting simulator.
 * @param {object} config - The configuration for the simulation.
 * @returns {object} The results of the simulation including trades and equity curve.
 */
const runSimulation = (config) => {
    const {
        candles,
        strategyFunction,
        strategyParams,
        riskParams,
        initialBalance,
    } = config;

    let currentBalance = initialBalance;
    let position = null;
    const closedTrades = [];
    const equityCurve = [{ timestamp: candles[0][0], balance: initialBalance }];

    const {
        riskManagementMode = 'standard',
        riskPercentage = 1,
        growthCapitalTarget = initialBalance * 2,
    } = riskParams;
    
    let isInGrowthMode = (riskManagementMode === 'dynamic' && initialBalance < growthCapitalTarget);

    // Main Simulation Loop
    for (let i = 1; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
        const historicalCandles = candles.slice(0, i + 1);

        // 1. Check for Exits on Open Positions
        if (position) {
            let exitPrice = null;
            let exitReason = '';

            const { slPrice, tpPrice, signal } = position;
            
            if (signal === 'buy') {
                if (low <= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                else if (high >= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
            } else { // 'sell'
                if (high >= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                else if (low <= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
            }

            if (exitPrice) {
                const pnl = (exitPrice - position.entryPrice) * position.size * (signal === 'buy' ? 1 : -1);
                currentBalance += pnl;

                position.exitTime = new Date(timestamp);
                position.exitPrice = exitPrice;
                position.profit = pnl;
                position.exitReason = exitReason;
                closedTrades.push({ ...position });
                equityCurve.push({ timestamp, balance: currentBalance });
                position = null;

                if (currentBalance <= 0) {
                    console.warn('Account wiped out. Ending simulation.');
                    break;
                }
            }
        }

        // 2. Check for Entries
        if (!position) {
            let signal = {};
            try {
                // 🚨 FIX 1: Safety net for strategy code execution 🚨
                signal = strategyFunction(historicalCandles, strategyParams);
            } catch (strategyError) {
                // Log the error for the strategy and skip the candle/entry check
                console.error(`[Strategy Execution Crash at ${new Date(timestamp).toISOString()}]:`, strategyError.message);
                continue; 
            }
            
            if (signal.signal === 'buy' || signal.signal === 'sell') {
                const { SL: slPercent, TP: tpPercent } = strategyParams;
                if (!slPercent || slPercent <= 0) continue;

                let effectiveRiskPercent = riskPercentage;
                if (isInGrowthMode) {
                    if (currentBalance >= growthCapitalTarget) {
                        isInGrowthMode = false;
                        effectiveRiskPercent = riskPercentage;
                    } else {
                        effectiveRiskPercent = 100;
                    }
                }

                const riskDecimal = effectiveRiskPercent / 100;
                const stopLossDecimal = slPercent / 100;
                
                let positionSizeDollars = (currentBalance * riskDecimal) / stopLossDecimal;
                positionSizeDollars = Math.min(positionSizeDollars, currentBalance);
                const positionSizeUnits = positionSizeDollars / close;

                position = {
                    entryPrice: close,
                    entryTime: new Date(timestamp),
                    size: positionSizeUnits,
                    signal: signal.signal,
                    slPrice: signal.signal === 'buy' ? close * (1 - stopLossDecimal) : close * (1 + stopLossDecimal),
                    tpPrice: signal.signal === 'buy' ? close * (1 + (tpPercent / 100)) : close * (1 - (tpPercent / 100)),
                };
            }
        }
    }
    
    // Add final equity point
    const lastTimestamp = candles[candles.length - 1][0];
    if (equityCurve[equityCurve.length - 1].timestamp !== lastTimestamp) {
        equityCurve.push({ timestamp: lastTimestamp, balance: currentBalance });
    }

    return { closedTrades, equityCurve };
};


/**
 * Calculates a comprehensive set of performance metrics from trades.
 * @param {Array} trades - The array of closed trades.
 * @param {number} initialBalance - The starting balance of the account.
 * @param {Array} equityCurve - The equity curve from the simulation.
 * @returns {object} A full suite of performance metrics.
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    if (trades.length === 0) {
        return {
            totalTrades: 0, winRate: 0, totalProfit: 0, finalBalance: initialBalance, initialBalance,
            maxDrawdown: 0, profitFactor: 0, winningTrades: 0, losingTrades: 0,
            averageWin: 0, averageLoss: 0, totalReturn: 0,
        };
    }

    const finalBalance = equityCurve[equityCurve.length - 1].balance;
    const totalProfit = finalBalance - initialBalance;
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0);

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
    
    let peakBalance = initialBalance;
    let maxDrawdownValue = 0;
    equityCurve.forEach(point => {
        if (point.balance > peakBalance) peakBalance = point.balance;
        const drawdown = peakBalance - point.balance;
        if (drawdown > maxDrawdownValue) maxDrawdownValue = drawdown;
    });

    return {
        initialBalance,
        finalBalance,
        totalProfit,
        totalReturn: (totalProfit / initialBalance) * 100,
        totalTrades: trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: (winningTrades.length / trades.length) * 100,
        averageWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
        averageLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity,
        maxDrawdown: peakBalance > 0 ? (maxDrawdownValue / peakBalance) * 100 : 0,
    };
};

/**
 * Orchestrates a backtest for a single strategy.
 * @param {object} config - The complete backtest configuration object.
 * @returns {object} The complete backtest results.
 */
export const runBacktest = async (config) => {
    const { userId, code, symbol, timeframe, startDate, endDate, simulateOnly = true, ...riskParams } = config;

    // 1. Fetch Strategy & Market Data
    const strategy = await Strategy.findOne({ userId, code }).lean();
    if (!strategy) throw new Error("Strategy not found.");
    
    const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
    if (!candles || candles.length < 2) throw new Error("Not enough market data for the selected period.");

    const strategyFunction = getStrategy(strategy.params.strategyType);
    const initialBalance = config.initialBalance || strategy.params.initialBalance || 1000;
    
    // 2. Run the Simulation
    const { closedTrades, equityCurve } = runSimulation({
        candles,
        strategyFunction,
        strategyParams: { ...strategy.params, ...config.params },
        riskParams,
        initialBalance,
    });
    
    // 3. Calculate Final Metrics
    const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

    // 4. Prepare Result Object
    const backtestData = {
        userId,
        symbol,
        timeframe,
        initialBalance,
        finalBalance: metrics.finalBalance,
        
        // ✅ FIX: Add these two lines to sync with the metrics object
        profit: metrics.totalProfit,
        totalTrades: metrics.totalTrades,

        startDate,
        endDate,
        candlesTested: candles.length,
        strategy: {
            name: strategy.name,
            code: strategy.code,
            type: strategy.params.strategyType,
            params: { ...strategy.params, ...config.params },
        },
        metrics,
        equityCurve,
        tradeHistory: closedTrades,
    };

    // 5. Save to DB or Return
    if (!simulateOnly) {
        return await Backtest.create(backtestData);
    }
    return backtestData;
};
