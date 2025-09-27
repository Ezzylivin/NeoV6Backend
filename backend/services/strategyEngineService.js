import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe, normalizeSymbol } from "./backtestDataService.js";

// --- Core Simulation Engine ---
// This new function is the heart of the backtester. It runs a candle-by-candle simulation.
const runSimulationLoop = (candles, initialBalance, riskParams, strategySignals, combinationRule) => {
    let currentBalance = initialBalance;
    let position = null; // Can be { entryPrice, entryTime, size, signal, slPrice, tpPrice, trailingStopPercent, highestPrice, lowestPrice }
    const closedTrades = [];
    const equityCurve = [{ timestamp: candles[0][0], balance: initialBalance }];

    const {
        riskManagementMode = 'standard',
        riskPercentage = 1,
        growthCapitalTarget = initialBalance * 2,
    } = riskParams;

    let isInGrowthMode = (riskManagementMode === 'dynamic' && initialBalance < growthCapitalTarget);

    for (let i = 0; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
        
        // --- 1. Check for Exits on Open Positions ---
        if (position) {
            let exitPrice = null;
            let exitReason = '';

            // Update trailing stop levels
            if (position.signal === 'buy') {
                position.highestPrice = Math.max(position.highestPrice, high);
                if (position.trailingStopPercent) {
                    const newSl = position.highestPrice * (1 - position.trailingStopPercent);
                    position.slPrice = Math.max(position.slPrice, newSl); // Trail the stop up
                }
            } else { // 'sell'
                position.lowestPrice = Math.min(position.lowestPrice, low);
                if (position.trailingStopPercent) {
                    const newSl = position.lowestPrice * (1 + position.trailingStopPercent);
                    position.slPrice = Math.min(position.slPrice, newSl); // Trail the stop down
                }
            }

            // Check for SL/TP hits
            if (position.signal === 'buy') {
                if (low <= position.slPrice) { exitPrice = position.slPrice; exitReason = 'Stop-Loss'; }
                else if (high >= position.tpPrice) { exitPrice = position.tpPrice; exitReason = 'Take-Profit'; }
            } else { // 'sell'
                if (high >= position.slPrice) { exitPrice = position.slPrice; exitReason = 'Stop-Loss'; }
                else if (low <= position.tpPrice) { exitPrice = position.tpPrice; exitReason = 'Take-Profit'; }
            }
            
            // Check for exit signal
            const currentSignals = strategySignals.map(s => s[i].signal);
            const finalSignal = applyCombinationRule(currentSignals, combinationRule);
            if (position.signal === 'buy' && finalSignal === 'sell') {
                exitPrice = close;
                exitReason = 'Signal Crossover';
            } else if (position.signal === 'sell' && finalSignal === 'buy') {
                exitPrice = close;
                exitReason = 'Signal Crossover';
            }

            if (exitPrice) {
                const pnl = (exitPrice - position.entryPrice) * position.size * (position.signal === 'buy' ? 1 : -1);
                currentBalance += pnl;

                position.exitTime = new Date(timestamp);
                position.exitPrice = exitPrice;
                position.profit = pnl;
                position.exitReason = exitReason;
                closedTrades.push(position);
                equityCurve.push({ timestamp, balance: currentBalance });
                position = null;

                if (currentBalance <= 0) {
                    console.warn('Account wiped out. Ending simulation.');
                    break; 
                }
            }
        }
        
        // --- 2. Check for Entries ---
        if (!position) {
            const currentSignals = strategySignals.map(s => s[i]);
            const finalSignal = applyCombinationRule(currentSignals.map(s => s.signal), combinationRule);

            if (finalSignal === 'buy' || finalSignal === 'sell') {
                const primarySignal = currentSignals.find(s => s.signal === finalSignal);
                const { SL: slPercent, TP: tpPercent, trailingStop: tsPercent } = primarySignal.params;

                // --- DYNAMIC RISK MANAGEMENT LOGIC ---
                let effectiveRiskPercent = 0;
                if (isInGrowthMode) {
                    if (currentBalance >= growthCapitalTarget) {
                        isInGrowthMode = false;
                        effectiveRiskPercent = riskPercentage;
                    } else {
                        effectiveRiskPercent = 100;
                    }
                } else {
                    effectiveRiskPercent = riskPercentage;
                }
                
                // --- POSITION SIZING CALCULATION ---
                const riskDecimal = effectiveRiskPercent / 100;
                const stopLossDecimal = slPercent / 100;
                
                if (stopLossDecimal <= 0) continue; // Cannot size position without a stop-loss

                let positionSizeDollars = (currentBalance * riskDecimal) / stopLossDecimal;
                positionSizeDollars = Math.min(positionSizeDollars, currentBalance); // Cap at current balance
                const positionSizeUnits = positionSizeDollars / close;

                position = {
                    entryPrice: close,
                    entryTime: new Date(timestamp),
                    size: positionSizeUnits,
                    signal: finalSignal,
                    slPrice: finalSignal === 'buy' ? close * (1 - stopLossDecimal) : close * (1 + stopLossDecimal),
                    tpPrice: finalSignal === 'buy' ? close * (1 + tpPercent / 100) : close * (1 - tpPercent / 100),
                    trailingStopPercent: tsPercent > 0 ? tsPercent / 100 : null,
                    highestPrice: close,
                    lowestPrice: close,
                };
            }
        }
    }
    
    // Add final equity point if the last trade is still open
    if (equityCurve[equityCurve.length - 1].timestamp !== candles[candles.length - 1][0]) {
        equityCurve.push({ timestamp: candles[candles.length - 1][0], balance: currentBalance });
    }

    return { trades: closedTrades, equityCurve };
};


// --- Main Service Functions ---

// Refactored to use the new simulation engine
export const runStrategyService = async (dbStrategy, params = {}, userId, simulateOnly = true) => {
    const { candles, message } = await fetchOHLCVMultiSafe(params.symbol, params.timeframe, params.startDate, params.endDate);
    if (!candles || candles.length < 1) {
        return { metrics: {}, equityCurve: [], tradeHistory: [], noTradeReason: message };
    }

    const strategyFunction = getStrategy(dbStrategy.params.strategyType);
    const signals = strategyFunction(candles, params.params); // Pass the merged params

    const riskParams = {
        riskManagementMode: params.riskManagementMode,
        riskPercentage: params.riskPercentage,
        growthCapitalTarget: params.growthCapitalTarget,
    };
    
    const { trades, equityCurve } = runSimulationLoop(candles, params.initialBalance, riskParams, [signals], 'OR');
    
    const { metrics, tradeHistory } = calculateMetrics(trades, params.initialBalance, equityCurve);
    
    if (!simulateOnly) { /* ... logic to save to DB ... */ }

    return { metrics, equityCurve, tradeHistory, strategyName: dbStrategy.name, noTradeReason: trades.length === 0 ? 'No trades triggered' : null };
};

// Refactored to use the new simulation engine and handle new payload
export const runCombinedStrategyService = async (userId, comboPayload) => {
    const { strategies: strategyConfigs, symbol, timeframe, startDate, endDate, initialBalance, combinationRule, ...riskParams } = comboPayload;

    const strategyCodes = strategyConfigs.map(s => s.code);
    const dbStrategies = await Strategy.find({ userId, code: { $in: strategyCodes } }).lean();
    if (dbStrategies.length !== strategyCodes.length) throw new Error("One or more strategies not found.");

    const { candles, message } = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
    if (!candles || candles.length < 1) { /* ... handle no candles ... */ }

    // --- Generate signals and run individual backtests in one pass ---
    const individualResults = [];
    const allStrategySignals = [];

    for (const config of strategyConfigs) {
        const dbStrategy = dbStrategies.find(s => s.code === config.code);
        if (!dbStrategy) continue;

        const finalParams = { ...dbStrategy.params, ...config.params };
        const strategyFunction = getStrategy(dbStrategy.params.strategyType);
        const signals = strategyFunction(candles, finalParams);
        allStrategySignals.push(signals);

        // Run individual simulation
        const { trades: indTrades, equityCurve: indEquityCurve } = runSimulationLoop(candles, initialBalance, riskParams, [signals], 'OR');
        const { metrics: indMetrics } = calculateMetrics(indTrades, initialBalance, indEquityCurve);
        
        individualResults.push({
            strategyName: dbStrategy.name,
            metrics: indMetrics,
            equityCurve: indEquityCurve
        });
    }

    // --- Run combined simulation ---
    const { trades: combinedTrades, equityCurve: combinedEquityCurve } = runSimulationLoop(candles, initialBalance, riskParams, allStrategySignals, combinationRule);
    const { metrics: combinedMetrics } = calculateMetrics(combinedTrades, initialBalance, combinedEquityCurve);

    return {
        combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve },
        individualResults
    };
};


// --- Helpers & Metrics (calculateMetrics needs slight adjustment) ---

const calculateMetrics = (trades, initialBalance = 1000, equityCurve) => {
    if (trades.length === 0) {
        return { metrics: { totalTrades: 0, winRate: 0, totalProfit: 0, finalBalance: initialBalance, initialBalance, maxDrawdown: 0, profitFactor: 0, winningTrades: 0, losingTrades: 0 }, tradeHistory: [] };
    }
    // ... a more robust calculateMetrics would go here, using the pre-calculated equityCurve for drawdown
};

function applyCombinationRule(signals, rule) {
    if (rule === 'AND') { /* ... */ } 
    else if (rule === 'OR') { /* ... */ }
    return 'hold';
}
