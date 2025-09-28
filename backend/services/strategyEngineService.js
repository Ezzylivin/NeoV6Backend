import Strategy from "../dbStructure/strategy.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

/**
 * A comprehensive, event-driven backtesting simulator.
 * This is the core engine that processes trades chronologically.
 * @param {object} config - The configuration for the simulation.
 * @returns {{closedTrades: Array, equityCurve: Array}} The results of the simulation.
 */
const runSimulationLoop = (config) => {
    const { candles, initialBalance, riskParams, strategySignals, combinationRule } = config;

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

    for (let i = 1; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
        
        if (position) {
            let exitPrice = null;
            let exitReason = '';

            if (position.signal === 'buy') {
                position.highestPrice = Math.max(position.highestPrice, high);
                if (position.trailingStopPercent) {
                    const newSl = position.highestPrice * (1 - position.trailingStopPercent);
                    position.slPrice = Math.max(position.slPrice, newSl);
                }
                if (low <= position.slPrice) { exitPrice = position.slPrice; exitReason = 'Stop-Loss'; }
                else if (high >= position.tpPrice) { exitPrice = position.tpPrice; exitReason = 'Take-Profit'; }
            } else { // 'sell'
                position.lowestPrice = Math.min(position.lowestPrice, low);
                if (position.trailingStopPercent) {
                    const newSl = position.lowestPrice * (1 + position.trailingStopPercent);
                    position.slPrice = Math.min(position.slPrice, newSl);
                }
                if (high >= position.slPrice) { exitPrice = position.slPrice; exitReason = 'Stop-Loss'; }
                else if (low <= position.tpPrice) { exitPrice = position.tpPrice; exitReason = 'Take-Profit'; }
            }
            
            const currentSignalsForExit = strategySignals.map(s => s[i].signal);
            const finalExitSignal = applyCombinationRule(currentSignalsForExit, combinationRule);
            if (position.signal === 'buy' && finalExitSignal === 'sell') {
                exitPrice = close; exitReason = 'Signal Crossover';
            } else if (position.signal === 'sell' && finalExitSignal === 'buy') {
                exitPrice = close; exitReason = 'Signal Crossover';
            }

            if (exitPrice) {
                const pnl = (exitPrice - position.entryPrice) * position.size * (position.signal === 'buy' ? 1 : -1);
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
        
        if (!position) {
            const currentSignalsForEntry = strategySignals.map(s => s[i]);
            const finalEntrySignal = applyCombinationRule(currentSignalsForEntry.map(s => s.signal), combinationRule);

            if (finalEntrySignal === 'buy' || finalEntrySignal === 'sell') {
                const primarySignal = currentSignalsForEntry.find(s => s.signal === finalEntrySignal);
                const { SL: slPercent, TP: tpPercent, trailingStop: tsPercent } = primarySignal.params;

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
                    entryPrice: close, entryTime: new Date(timestamp), size: positionSizeUnits, signal: finalEntrySignal,
                    slPrice: finalEntrySignal === 'buy' ? close * (1 - stopLossDecimal) : close * (1 + stopLossDecimal),
                    tpPrice: finalEntrySignal === 'buy' ? close * (1 + (tpPercent / 100)) : close * (1 - (tpPercent / 100)),
                    trailingStopPercent: tsPercent > 0 ? tsPercent / 100 : null,
                    highestPrice: close, lowestPrice: close,
                };
            }
        }
    }
    
    const lastTimestamp = candles[candles.length - 1][0];
    if (equityCurve[equityCurve.length - 1].timestamp !== lastTimestamp) {
        equityCurve.push({ timestamp: lastTimestamp, balance: currentBalance });
    }

    return { trades: closedTrades, equityCurve };
};

/**
 * Calculates a comprehensive set of performance metrics.
 * @returns {object} A full suite of performance metrics.
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    if (trades.length === 0) {
        return { 
            metrics: { 
                totalTrades: 0, winRate: 0, totalProfit: 0, finalBalance: initialBalance, initialBalance, 
                maxDrawdown: 0, profitFactor: 0, winningTrades: 0, losingTrades: 0, 
                averageWin: 0, averageLoss: 0, totalReturn: 0 
            }, 
            tradeHistory: [] 
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

    const metrics = {
        initialBalance, finalBalance, totalProfit,
        totalReturn: (totalProfit / initialBalance) * 100,
        totalTrades: trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
        averageWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
        averageLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity,
        maxDrawdown: peakBalance > 0 ? (maxDrawdownValue / peakBalance) * 100 : 0,
    };
    
    return { metrics, tradeHistory: trades };
};

/**
 * Applies the combination logic to a set of signals for a single candle.
 * @returns {'buy'|'sell'|'hold'} The final combined signal.
 */
function applyCombinationRule(signals, rule) {
    if (rule === 'AND') {
        if (signals.length > 0 && signals.every(s => s === 'buy')) return 'buy';
        if (signals.length > 0 && signals.every(s => s === 'sell')) return 'sell';
    } else { // Default to OR
        if (signals.some(s => s === 'buy')) return 'buy';
        if (signals.some(s => s === 'sell')) return 'sell';
    }
    return 'hold';
}

// --- Main Service Functions ---

export const runStrategyService = async (dbStrategy, params = {}, userId, simulateOnly = true) => {
    const { candles, message } = await fetchOHLCVMultiSafe(params.symbol, params.timeframe, params.startDate, params.endDate);
    if (!candles || candles.length < 2) {
        return { metrics: {}, equityCurve: [], tradeHistory: [], noTradeReason: message };
    }

    const strategyFunction = getStrategy(dbStrategy.params.strategyType);
    const finalParams = { ...dbStrategy.params, ...params.params };
    
    const strategySignals = [];
    for (let i = 1; i <= candles.length; i++) {
        strategySignals.push(strategyFunction(candles.slice(0, i), finalParams));
    }

    const { trades, equityCurve } = runSimulationLoop({
        candles,
        initialBalance: params.initialBalance,
        riskParams: params,
        strategySignals: [strategySignals],
        combinationRule: 'OR'
    });
    
    const { metrics, tradeHistory } = calculateMetrics(trades, params.initialBalance, equityCurve);
    
    // ... logic to save to DB ...
    
    return { metrics, equityCurve, tradeHistory, strategyName: dbStrategy.name, noTradeReason: trades.length === 0 ? 'No trades triggered' : null };
};

export const runCombinedStrategyService = async (userId, comboPayload) => {
    const { strategies: strategyConfigs, symbol, timeframe, startDate, endDate, initialBalance, combinationRule, ...riskParams } = comboPayload;

    const strategyCodes = strategyConfigs.map(s => s.code);
    const dbStrategies = await Strategy.find({ userId, code: { $in: strategyCodes } }).lean();
    if (dbStrategies.length !== strategyCodes.length) throw new Error("One or more strategies not found.");

    const { candles, message } = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
    if (!candles || candles.length < 2) {
        return { combinedResult: { metrics: { totalTrades: 0, finalBalance: initialBalance, initialBalance }, equityCurve: [] }, individualResults: [] };
    }

    const strategyFunctions = strategyConfigs.map(config => {
        const dbStrategy = dbStrategies.find(s => s.code === config.code);
        return {
            name: dbStrategy.name,
            func: getStrategy(dbStrategy.params.strategyType),
            params: { ...dbStrategy.params, ...config.params }
        };
    });

    const allStrategySignals = [];
    for (const strat of strategyFunctions) {
        const signalsForStrat = [];
        for (let i = 1; i <= candles.length; i++) {
            signalsForStrat.push(strat.func(candles.slice(0, i), strat.params));
        }
        allStrategySignals.push(signalsForStrat);
    }
    
    const individualResults = allStrategySignals.map((signals, idx) => {
        const { trades, equityCurve } = runSimulationLoop({ candles, initialBalance, riskParams, strategySignals: [signals], combinationRule: 'OR' });
        const { metrics } = calculateMetrics(trades, initialBalance, equityCurve);
        return { strategyName: strategyFunctions[idx].name, metrics, equityCurve };
    });

    const { trades: combinedTrades, equityCurve: combinedEquityCurve } = runSimulationLoop({ candles, initialBalance, riskParams, strategySignals: allStrategySignals, combinationRule });
    const { metrics: combinedMetrics } = calculateMetrics(combinedTrades, initialBalance, combinedEquityCurve);

    return {
        combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve, strategies: strategyCodes },
        individualResults
    };
};
