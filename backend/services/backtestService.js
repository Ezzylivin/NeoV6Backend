// File: services/backtestService.js
// FINAL VERSION:
// - Fetches pre-calculated results for Pure ML mode ('on').
// - Uses original Node.js simulation for Pure TA ('off').
// - Uses original Node.js simulation + ML server calls for Hybrid ('predictions').

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";
import axios from "axios";
import { parse } from "csv-parse"; // Keep for Hybrid mode feature parsing
import https from 'https'; // Keep for ML server calls (Hybrid/Config)
import { finished } from 'stream/promises'; // Keep for Hybrid mode feature parsing
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const ML_SERVER_URL = "https://74.208.28.77:8000"; // Keep for config/bulk predictions if Hybrid stays
// --------------------------------------------------------

// Agent to ignore SSL errors (keep if Hybrid stays or if fetching config)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Fetches the model's configuration (like feature list) from the ML server.
 * (Needed for Hybrid mode)
 */
const _getMLConfig = async (modelName, authToken) => {
    const config_url = `${ML_SERVER_URL}/api/ml/config/${modelName}`;
    console.log(`[ML] Fetching config for model: ${modelName}`);
    const headers = {};
    if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }

    try {
        const response = await axios.get(config_url, { httpsAgent, headers });
        if (!response.data || !response.data.features || !Array.isArray(response.data.features)) {
            throw new Error("Invalid config format received from ML server.");
        }
        console.log(`[ML] Received ${response.data.features.length} feature names for ${modelName}.`);
        return response.data;
    } catch (error) {
        let errorMessage = `Failed to fetch ML config for ${modelName}.`;
        if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server.`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Config fetch failed: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


/**
 * Downloads and parses the feature file using streams.
 * (Needed for Hybrid mode)
 */
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    const data_filename = `${symbol.replace('/', '')}-${timeframe}-features.csv`;
    const data_url = `${ML_SERVER_URL}/data/${data_filename}`;
    console.log(`[ML] Streaming feature data from: ${data_url} for Hybrid Mode`);

    const start_ms = new Date(startDate + 'T00:00:00.000Z').getTime();
    const end_ms = new Date(endDate + 'T23:59:59.999Z').getTime();

    if (isNaN(start_ms) || isNaN(end_ms)) { throw new Error("Invalid start or end date format."); }

    const filteredData = [];
    const parser = parse({
        columns: true, skip_empty_lines: true,
        cast: (value, context) => {
             if (context.header) return value;
             if (context.column === 'datetime') return value;
             const num = Number(value);
             if (!isNaN(num) && value !== null && String(value).trim() !== '') return num;
             return value;
         }
    });

    parser.on('readable', () => {
         let record;
         while ((record = parser.read()) !== null) {
             const row_ms = new Date(record.datetime).getTime();
             if (isNaN(row_ms)) continue;
             if (row_ms >= start_ms && row_ms <= end_ms) {
                 Object.keys(record).forEach(key => {
                     if (key !== 'datetime' && typeof record[key] === 'string') {
                         const num = Number(record[key]);
                         if (!isNaN(num) && record[key].trim() !== '') {
                             record[key] = num;
                         }
                     }
                 });
                 filteredData.push(record);
             }
         }
     });
    parser.on('error', (err) => { throw new Error(`Failed to parse CSV data: ${err.message}`); });

    try {
        const response = await axios.get(data_url, { responseType: 'stream', httpsAgent, timeout: 300000 });
        response.data.pipe(parser);
        await finished(parser);
        if (filteredData.length === 0) { throw new Error(`No historical feature data found for the selected date range (${startDate} to ${endDate}).`); }
        console.log(`[ML] Found ${filteredData.length} feature rows for Hybrid Mode date range.`);
        return filteredData;
    } catch (error) {
        let errorMessage = `Failed to stream feature file from ${data_url}.`;
        if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server. Is it running?`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Failed to stream feature file for Hybrid: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};

/**
 * Gets bulk ML predictions.
 * (Needed for Hybrid mode)
 */
const _getBulkPredictions = async (modelName, features, authToken) => {
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`;
    console.log(`[ML] Getting bulk predictions for ${modelName} (${features.length} samples}) for Hybrid Mode...`);
    try {
        const payload = { model_name: modelName, features: features };
        const headers = {};
        if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }
        else { console.warn("[ML] WARNING: No auth token provided for bulk prediction call."); }

        const response = await axios.post(bulk_url, payload, { httpsAgent, headers, timeout: 180000 });

        const predictions = response.data.predictions.map(p => {
            if (typeof p === 'number') {
                return { prediction: p, probability: 1.0 };
            } else if (p && p.prediction !== undefined && p.probability !== undefined) {
                return p;
            } else {
                console.warn("[ML] Unexpected prediction format received:", p);
                return { prediction: 0, probability: 0.0 };
            }
        });

        console.log(`[ML] Received ${predictions.length} predictions for Hybrid Mode.`);
        return predictions;

    } catch (error) {
        let errorMessage = `Bulk prediction failed for model ${modelName} (Hybrid).`;
        if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server. Is it running?`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Bulk prediction failed for Hybrid: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


/**
 * --- SIMULATION ENGINE ---
 * (Used by Pure TA and Hybrid modes)
 */
const runSimulation = (config) => {
    const {
        candles,
        strategyFunction,
        strategyParams,
        riskParams,
        initialBalance,
        mlMode,
        mlPredictions,
        mlThreshold = 0.5
    } = config;

    console.log(`[Simulation] Starting simulation. Mode: ${mlMode}. Candles: ${candles.length}. Predictions: ${mlPredictions?.length || 0}`);
    console.log(`[Simulation] Initial Balance: $${initialBalance.toFixed(2)}. Risk: ${riskParams?.riskPercentage || 1}%`);
    console.log(`[Simulation] ML Threshold set to: ${mlThreshold}`);

    let currentBalance = initialBalance;
    let position = null;
    const closedTrades = [];
    const firstTimestamp = candles[0]?.[0];
    if (typeof firstTimestamp !== 'number' || isNaN(firstTimestamp)) {
        throw new Error("Invalid timestamp for the first candle.");
    }
    const equityCurve = [{ timestamp: firstTimestamp, balance: initialBalance }];

    const {
        riskManagementMode = 'standard',
        riskPercentage = 1,
        growthCapitalTarget = initialBalance * 2,
    } = riskParams || {};

    let isInGrowthMode = (riskManagementMode === 'dynamic' && initialBalance < growthCapitalTarget);

    // Load Filter Strategies
    const trendFilterPeriod = strategyParams?.trendFilterPeriod;
    const minAtrPct = strategyParams?.minAtrPct;

    let trendFilterStrategy = null;
    if (trendFilterPeriod && trendFilterPeriod > 0) {
        trendFilterStrategy = getStrategy("Moving Average");
        if (!trendFilterStrategy) console.warn("Warning: Trend filter specified but 'Moving Average' strategy not found.");
    }

    let atrStrategy = null;
    if (minAtrPct && minAtrPct > 0) {
        atrStrategy = getStrategy("ATR");
        if (!atrStrategy) console.warn("Warning: Volatility filter specified but 'ATR' strategy not found.");
    }

    const isSignalHighConfidence = (mlPrediction) => {
        if (!mlThreshold || mlThreshold <= 0) return true;
        if (typeof mlPrediction !== 'object' || typeof mlPrediction.probability !== 'number' || isNaN(mlPrediction.probability)) return false;
        return mlPrediction.probability >= mlThreshold;
    };

    // Correctly map ML Server prediction (0, 1, 2) to internal signal (-1, 0, 1)
    const getMLSignalLabel = (mlPrediction) => {
        if (mlPrediction === null || mlPrediction === undefined) return 0;
        const rawPrediction = mlPrediction?.prediction !== undefined ? mlPrediction.prediction : mlPrediction;
        // Assuming ML Server uses 0=Sell, 1=Hold, 2=Buy (mapped from Python's -1, 0, 1)
        if (rawPrediction === 0) return -1; // Sell
        if (rawPrediction === 1) return 0;  // Hold
        if (rawPrediction === 2) return 1;  // Buy
        // console.warn(`[Simulation] Unexpected raw ML prediction value: ${rawPrediction}`);
        return 0; // Default to hold
    };

    // Main Simulation Loop
    for (let i = 1; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
        if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) {
            console.warn(`[Simulation] Skipping candle ${i} due to invalid data:`, candles[i]);
            continue;
        }
        const historicalCandles = candles.slice(0, i + 1);

        const currentMLPrediction = mlPredictions?.[i];
        const mlSignal = getMLSignalLabel(currentMLPrediction); // Gets -1, 0, or 1

        // --- 1. Check for Exits ---
        if (position) {
            let exitPrice = null;
            let exitReason = '';
            const { slPrice, tpPrice, signal: entrySignal } = position;

            // A. ML Exit Signal (Reverse)
            if ((mlMode === 'on' || mlMode === 'predictions') && currentMLPrediction && isSignalHighConfidence(currentMLPrediction)) {
                if (mlSignal === -1 && entrySignal === 'buy') { exitPrice = close; exitReason = 'ML Exit Signal (Reverse)'; }
                else if (mlSignal === 1 && entrySignal === 'sell') { exitPrice = close; exitReason = 'ML Exit Signal (Reverse)'; }
            }

            // B. SL/TP Check
            if (exitPrice === null) {
                const validSlPrice = typeof slPrice === 'number' && !isNaN(slPrice) && isFinite(slPrice);
                const validTpPrice = typeof tpPrice === 'number' && !isNaN(tpPrice) && isFinite(tpPrice);
                if (entrySignal === 'buy') {
                    if (validSlPrice && low <= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                    else if (validTpPrice && high >= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
                } else if (entrySignal === 'sell') {
                    if (validSlPrice && high >= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                    else if (validTpPrice && low <= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
                }
            }

            // C. Process Exit
            if (exitPrice !== null) {
                exitPrice = (typeof exitPrice !== 'number' || isNaN(exitPrice)) ? close : exitPrice; // Fallback to close on invalid price
                const pnl = (exitPrice - position.entryPrice) * position.size * (entrySignal === 'buy' ? 1 : -1);
                currentBalance += pnl;

                position.exitTime = new Date(timestamp);
                position.exitPrice = exitPrice;
                position.profit = pnl;
                position.exitReason = exitReason;
                closedTrades.push({ ...position });
                equityCurve.push({ timestamp, balance: currentBalance });
                position = null;

                if (currentBalance <= 0) { console.warn('[Simulation] Account wiped out.'); break; }
            }
        } // End Exit Check

        // --- 2. Check for Entries ---
        if (!position && currentBalance > 0) {

            // A. Volatility Filter
            if (atrStrategy && minAtrPct > 0) {
                try {
                    const atrResult = atrStrategy(historicalCandles, { period: 14 });
                    const atrValue = atrResult?.value;
                    if (typeof atrValue === 'number' && !isNaN(atrValue) && close > 0) {
                        const atrPercent = (atrValue / close) * 100;
                        if (atrPercent < minAtrPct) continue; // Skip entry
                    }
                } catch (e) { console.warn(`[Simulation] ATR filter failed candle ${i}: ${e.message}`); }
            }

            // B. Get Signals
            let taSignal = 'hold';
            let finalSignal = 'hold';
            let mlEntrySignal = 0; // -1, 0, 1

            if (mlMode === 'off' || mlMode === 'predictions') {
                if (!strategyFunction) { console.error("Strategy function missing."); continue; }
                try { taSignal = strategyFunction(historicalCandles, strategyParams)?.signal || 'hold'; }
                catch (e) { console.error(`Strategy Crash candle ${i}:`, e.message); continue; }
            }

            if (mlMode === 'on' || mlMode === 'predictions') {
                mlEntrySignal = (currentMLPrediction && isSignalHighConfidence(currentMLPrediction)) ? mlSignal : 0;
            }

            // C. Determine Final Signal
            const hybridMode = strategyParams?.hybridMode || 'AND';
            const mlIsBuy = (mlEntrySignal === 1);
            const mlIsSell = (mlEntrySignal === -1);

            if (mlMode === 'off') { finalSignal = taSignal; }
            else if (mlMode === 'on') {
                if (mlIsBuy) { finalSignal = 'buy'; }
                else if (mlIsSell) { finalSignal = 'sell'; }
                // Trend Filter for Pure ML
                if (trendFilterStrategy && finalSignal !== 'hold' && trendFilterPeriod > 0) {
                    try {
                        const taRegime = trendFilterStrategy(historicalCandles, { period: trendFilterPeriod })?.signal || 'hold';
                        if ((finalSignal === 'buy' && taRegime !== 'buy') || (finalSignal === 'sell' && taRegime !== 'sell')) {
                            finalSignal = 'hold';
                        }
                    } catch (e) { console.warn(`Trend filter failed candle ${i}: ${e.message}`); }
                }
            }
            else if (mlMode === 'predictions') { // Hybrid
                if (hybridMode === 'Regime') {
                    if (mlIsBuy && taSignal === 'buy') { finalSignal = 'buy'; }
                    else if (mlIsSell && taSignal === 'sell') { finalSignal = 'sell'; }
                } else if (hybridMode === 'OR') {
                    if (taSignal === 'buy' || mlIsBuy) { finalSignal = 'buy'; }
                    else if (taSignal === 'sell' || mlIsSell) { finalSignal = 'sell'; }
                } else { // AND (Default)
                    if (taSignal === 'buy' && mlIsBuy) { finalSignal = 'buy'; }
                    else if (taSignal === 'sell' && mlIsSell) { finalSignal = 'sell'; }
                }
            }

            // D. Execute Entry
            if (finalSignal === 'buy' || finalSignal === 'sell') {
                const slPercentInput = strategyParams?.SL;
                const tpPercentInput = strategyParams?.TP;
                const parsedSL = (typeof slPercentInput === 'number' && !isNaN(slPercentInput) && slPercentInput > 0) ? slPercentInput : 1.0;
                const parsedTP = (typeof tpPercentInput === 'number' && !isNaN(tpPercentInput) && tpPercentInput > 0) ? tpPercentInput : 2.0;
                const sizingSL = Math.max(0.1, parsedSL);

                let effectiveRiskPercent = riskPercentage;
                if (isInGrowthMode) {
                     if (currentBalance >= growthCapitalTarget) { isInGrowthMode = false; }
                     else { effectiveRiskPercent = 100; }
                }
                const riskDecimal = Math.max(0, Math.min(1, effectiveRiskPercent / 100));
                const stopLossDecimal = sizingSL / 100;

                let positionSizeDollars = (currentBalance * riskDecimal) / stopLossDecimal;
                positionSizeDollars = Math.min(positionSizeDollars, currentBalance);
                const positionSizeUnits = close > 0 ? positionSizeDollars / close : 0;

                if (positionSizeUnits > 0) {
                    const slPrice = finalSignal === 'buy' ? close * (1 - parsedSL / 100) : close * (1 + parsedSL / 100);
                    const tpPrice = finalSignal === 'buy' ? close * (1 + parsedTP / 100) : close * (1 - parsedTP / 100);
                    position = {
                        entryPrice: close, entryTime: new Date(timestamp), size: positionSizeUnits,
                        signal: finalSignal, slPrice: slPrice, tpPrice: tpPrice,
                        mlEntrySignal: mlMode !== 'off' ? mlEntrySignal : null,
                        mlEntryConfidence: mlMode !== 'off' ? currentMLPrediction?.probability : null
                    };
                }
            } // End Entry Execution
        } // End Entry Check
    } // End Main Loop

    // Final Equity Point
    if (candles.length > 0) {
        const lastTimestamp = candles[candles.length - 1][0];
        if (equityCurve.length === 0 || equityCurve[equityCurve.length - 1].timestamp !== lastTimestamp) {
            const lastClose = candles[candles.length - 1][4];
            const finalEquity = position ? (position.size * lastClose) : currentBalance;
            equityCurve.push({ timestamp: lastTimestamp, balance: finalEquity });
        }
    }

    console.log(`[Simulation] Finished. Trades: ${closedTrades.length}. Final Balance: $${equityCurve[equityCurve.length -1]?.balance?.toFixed(2) || 'N/A'}`);
    return { closedTrades, equityCurve };
};


/**
 * Calculates metrics.
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    if (!equityCurve || equityCurve.length === 0 || typeof initialBalance !== 'number' || isNaN(initialBalance)) {
        console.warn("[Metrics] Invalid input for calculation. Returning zeroed metrics.");
        // Return structure consistent with expected metrics object
        return { initialBalance: initialBalance || 0, finalBalance: initialBalance || 0, totalProfit: 0, totalReturn: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 };
    }
    const finalBalance = equityCurve[equityCurve.length - 1].balance;
    // Check finalBalance validity
    if (typeof finalBalance !== 'number' || isNaN(finalBalance)) {
        console.error(`[Metrics Error] Final balance is invalid: ${finalBalance}. Using initial balance as fallback.`);
        // Fallback: return zeroed profit metrics but keep balances for context
        return { initialBalance, finalBalance: initialBalance, totalProfit: 0, totalReturn: 0, totalTrades: trades.length, winningTrades: 0, losingTrades: trades.length, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 };
    }

    const totalProfit = finalBalance - initialBalance;
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0); // Includes zero profit trades
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));

    // Calculate Max Drawdown %
    let peakBalance = -Infinity;
    let maxDrawdownPercent = 0; // Initialize to 0
    equityCurve.forEach(point => {
        if (typeof point.balance !== 'number' || isNaN(point.balance)) return;
        if (point.balance > peakBalance) peakBalance = point.balance;
        // Calculate drawdown relative to the peak only if peak is positive
        const currentDrawdownPercent = peakBalance > 0 ? ((peakBalance - point.balance) / peakBalance) * 100 : 0;
        if (currentDrawdownPercent > maxDrawdownPercent) maxDrawdownPercent = currentDrawdownPercent;
    });

    const totalTrades = trades.length;
    const metrics = {
        initialBalance,
        finalBalance,
        totalProfit,
        totalReturn: initialBalance !== 0 ? (totalProfit / initialBalance) * 100 : 0,
        totalTrades: totalTrades,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0,
        averageWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
        averageLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null),
        maxDrawdown: maxDrawdownPercent, // Use the percentage calculated
    };

    // Handle Infinity PF for display/JSON
    if (metrics.profitFactor === Infinity) {
        console.log("[Metrics] Profit Factor is Infinity (no losing trades). Setting to null for storage.");
        metrics.profitFactor = null;
    }

    console.log(`[Metrics] Calculated: Trades: ${metrics.totalTrades}, Win Rate: ${metrics.winRate?.toFixed(2)}%, PF: ${metrics.profitFactor?.toFixed(2) ?? 'N/A'}, Max DD: ${metrics.maxDrawdown?.toFixed(2)}%, Final Balance: $${metrics.finalBalance?.toFixed(2)}`);
    return metrics;
};

/**
 * Aggregates metrics for combo tests.
 */
const _aggregateMetrics = (individualResults, initialBalance) => {
    if (!individualResults || individualResults.length === 0) {
        return { initialBalance, finalBalance: initialBalance, totalProfit: 0, totalReturn: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 };
    }
    const totalTrades = individualResults.reduce((sum, r) => sum + (r.metrics?.totalTrades || 0), 0);
    const winningTrades = individualResults.reduce((sum, r) => sum + (r.metrics?.winningTrades || 0), 0);
    const losingTrades = totalTrades - winningTrades;
    const grossProfit = individualResults.reduce((sum, r) => sum + ((r.metrics?.averageWin || 0) * (r.metrics?.winningTrades || 0)), 0);
    const grossLoss = individualResults.reduce((sum, r) => sum + ((r.metrics?.averageLoss || 0) * (r.metrics?.losingTrades || 0)), 0);

    const totalProfit = grossProfit - grossLoss;
    const finalBalance = initialBalance + totalProfit;
    const totalReturn = initialBalance !== 0 ? (totalProfit / initialBalance) * 100 : 0;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    let profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null);

    const avgMaxDrawdown = individualResults.length > 0
        ? individualResults.reduce((sum, r) => sum + (r.metrics?.maxDrawdown || 0), 0) / individualResults.length
        : 0;

    if (profitFactor === Infinity) profitFactor = null; // Handle Infinity

    return {
        initialBalance, finalBalance, totalProfit, totalReturn,
        totalTrades, winningTrades, losingTrades, winRate,
        averageWin: winningTrades > 0 ? grossProfit / winningTrades : 0,
        averageLoss: losingTrades > 0 ? grossLoss / losingTrades : 0,
        profitFactor,
        maxDrawdown: avgMaxDrawdown
    };
};


/**
 * --- MASTER ORCHESTRATOR ---
 * Final Version: Fetches pre-calculated results for Pure ML mode ('on').
 * Uses Node.js simulation for Pure TA ('off') and Hybrid ('predictions').
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log("[runBacktest] Starting orchestrator with config:", JSON.stringify(config, null, 2)); // Log incoming config

    const isComboTest = config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0;

    const initialBalance = parseFloat(config.initialBalance || 1000);
    if (isNaN(initialBalance) || initialBalance <= 0) {
        throw new Error(`Invalid Initial Balance provided: ${config.initialBalance}`);
    }

    const {
        userId, symbol, timeframe, startDate, endDate,
        mlMode = 'off', mlModel, mlThreshold, ...otherParams
    } = config;

    // Separate risk params and global params
    const riskParams = {
        riskManagementMode: config.riskManagementMode,
        riskPercentage: config.riskPercentage,
        growthCapitalTarget: config.growthCapitalTarget
    };
    const globalParams = config.params || {}; // Global filter params etc.

    let candles;
    let mlPredictions = null;
    let dynamicFeatureNames = [];

    try {
        // --- STEP 1: Handle Different Modes ---

        if (mlMode === 'on') {
            // --- ✅ NEW: PURE ML MODE ---
            console.log(`[Orchestrator] Fetching pre-calculated ML backtest results for model: ${mlModel || 'default'}`);
            try {
                const port = process.env.PORT || 5000;
                const internalApiUrl = `http://127.0.0.1:${port}/api/ml/ml-backtest-results`;
                console.log(`[Orchestrator] Calling internal API: ${internalApiUrl}`);

                const response = await axios.get(internalApiUrl);
                const mlResult = response.data;

                if (!mlResult || typeof mlResult !== 'object' || !mlResult.initial_balance) { // Basic check
                    throw new Error("Invalid or empty data received from internal ML results endpoint.");
                }
                console.log("[Orchestrator] Successfully fetched pre-calculated ML results.");

                // --- Format the result ---
                const formattedResult = {
                    userId, symbol, timeframe, initialBalance: mlResult.initial_balance,
                    finalBalance: mlResult.final_balance,
                    profit: mlResult.final_balance - mlResult.initial_balance,
                    totalTrades: mlResult.total_trades,
                    startDate: new Date(startDate).toISOString(),
                    endDate: new Date(endDate).toISOString(),
                    candlesTested: mlResult.equity_curve?.length || 0,
                    strategy: {
                        name: `ML: ${mlModel || 'Default'}`,
                        type: 'ml',
                        params: { ...globalParams, mlThreshold: mlThreshold },
                        mlModel: mlModel || 'Default'
                    },
                    metrics: {
                        initialBalance: mlResult.initial_balance,
                        finalBalance: mlResult.final_balance,
                        totalProfit: mlResult.final_balance - mlResult.initial_balance,
                        totalReturn: mlResult.total_profit_pct,
                        totalTrades: mlResult.total_trades,
                        winningTrades: Math.round(mlResult.total_trades * (mlResult.win_rate / 100)),
                        losingTrades: Math.round(mlResult.total_trades * (1 - (mlResult.win_rate / 100))),
                        winRate: mlResult.win_rate,
                        averageWin: 0, // Placeholder - Calculate below
                        averageLoss: 0, // Placeholder - Calculate below
                        profitFactor: mlResult.profit_factor === Infinity ? null : mlResult.profit_factor,
                        maxDrawdown: mlResult.max_drawdown_pct
                    },
                    equityCurve: mlResult.equity_curve.map(p => ({
                         timestamp: p.time, balance: p.equity
                    })),
                    tradeHistory: mlResult.trades.map(t => ({
                        action: t.action, // 'buy' or 'sell'
                        price: t.price,
                        time: t.time,
                        size: t.size,
                        pnl_pct: t.pnl_pct,
                        profit: t.profit_usd || 0,
                        // Add simplified entry/exit times/reasons if needed by frontend
                        entryTime: t.action === 'buy' ? t.time : null,
                        exitTime: t.action === 'sell' ? t.time : null,
                        exitReason: t.action === 'sell' ? 'ML Signal/Logic' : null, // Generic reason
                    })),
                };

                // Calculate Avg Win/Loss from detailed trades
                const finalTrades = formattedResult.tradeHistory.filter(t => t.action === 'sell' && typeof t.profit === 'number');
                const finalWinning = finalTrades.filter(t => t.profit > 0);
                const finalLosing = finalTrades.filter(t => t.profit <= 0);
                if (finalWinning.length > 0) {
                     formattedResult.metrics.averageWin = finalWinning.reduce((sum, t) => sum + t.profit, 0) / finalWinning.length;
                }
                if (finalLosing.length > 0) {
                     formattedResult.metrics.averageLoss = Math.abs(finalLosing.reduce((sum, t) => sum + t.profit, 0)) / finalLosing.length;
                }

                 // Save or return
                 if (!simulateOnly) {
                     console.log(`[Orchestrator] Saving fetched ML backtest result to database.`);
                     return await Backtest.create(formattedResult);
                 }
                 console.log(`[Orchestrator] Returning simulation-only fetched ML result.`);
                 return formattedResult;

            } catch (error) {
                console.error(`[Orchestrator] Failed to fetch/process pre-calculated ML results: ${error.message}`);
                if (error.response) { console.error("Response:", error.response.status, error.response.data); }
                 else if (error.request) { console.error("No response received from internal API."); }
                 else { console.error("Error Setup:", error.message); }
                throw new Error(`Failed to retrieve ML backtest results. Check internal API endpoint '/api/ml/ml-backtest-results'. Error: ${error.message}`);
            }

        } else if (mlMode === 'predictions') {
            // --- HYBRID MODE (Using Node.js simulation) ---
            console.log(`[Orchestrator] Running HYBRID backtest via Node.js simulation.`);
            if (!mlModel) throw new Error("ML Model name ('mlModel') is required for Hybrid mode.");

            const mlConfig = await _getMLConfig(mlModel, authToken);
            dynamicFeatureNames = mlConfig.features;
            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);

            candles = fullFeatureData.map(row => { /* ... extract candles ... */
                const timestamp = new Date(row.datetime).getTime();
                const open = Number(row.open); const high = Number(row.high);
                const low = Number(row.low); const close = Number(row.close);
                if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) return null;
                return [timestamp, open, high, low, close];
            }).filter(Boolean);

            if (!candles || candles.length < 2) throw new Error("Not enough valid candle data for Hybrid.");

            const validTimestamps = new Set(candles.map(c => c[0]));
            const alignedFeatureData = fullFeatureData.filter(row => validTimestamps.has(new Date(row.datetime).getTime()));

            const features = alignedFeatureData.map(row =>
                 dynamicFeatureNames.map(feature => {
                     const val = row[feature];
                     return (typeof val !== 'number' || isNaN(val)) ? 0 : val;
                 })
             );

            if (features.length !== candles.length) { throw new Error(`Hybrid Data alignment failed: Candles (${candles.length}), Features (${features.length}).`); }

            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
            if (mlPredictions.length !== candles.length) { throw new Error(`Hybrid Prediction count mismatch: Candles (${candles.length}), Predictions (${mlPredictions.length}).`); }

            console.log(`[Orchestrator] Hybrid Prep Complete.`);
            // Continue below to common simulation step...

        } else { // mlMode === 'off'
             // --- ✅ ORIGINAL PURE TA MODE --- (Kept As Is)
             console.log(`[Orchestrator] Pure TA mode detected. Fetching OHLCV data.`);
             const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
             if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for the selected period.");
             candles = data.candles;
             console.log(`[Orchestrator] Fetched ${candles.length} candles for Pure TA.`);
             // Continue below to common simulation step...
        }


        // --- STEP 2: Execute Simulation(s) (Only for TA and Hybrid) ---
        if (mlMode !== 'on') {
            if (isComboTest) {
                // --- COMBO MODE (TA or Hybrid) ---
                console.log(`[Orchestrator] Running COMBO backtest. Mode: ${mlMode}`);
                const individualResults = [];
                for (const stratConfig of config.strategies) {
                    const { code, params: stratParams } = stratConfig;
                    const strategy = await Strategy.findOne({ userId, code }).lean();
                    // ... (Validate strategy, get function) ...
                     if (!code) throw new Error("Strategy 'code' required.");
                     if (!strategy) throw new Error(`Strategy '${code}' not found.`);
                     if (!strategy.params?.strategyType) throw new Error(`Strategy '${code}' missing params.`);
                     const strategyFunction = getStrategy(strategy.params.strategyType);
                     if (!strategyFunction) throw new Error(`Function for '${strategy.params.strategyType}' not found.`);

                    const combinedParams = { ...globalParams, ...strategy.params, ...stratParams }; // Ensure global params are included

                    console.log(`[Orchestrator] Simulating combo item: ${strategy.name}`);
                    const { closedTrades, equityCurve } = runSimulation({
                        candles, strategyFunction, strategyParams: combinedParams,
                        riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
                    });
                    const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);
                    individualResults.push({
                         strategyName: strategy.name, metrics,
                         equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })),
                     });
                }
                // Aggregate results
                const combinedMetrics = _aggregateMetrics(individualResults, initialBalance);
                 const combinedEquityCurve = individualResults[0]?.equityCurve || [{ timestamp: new Date(startDate).toISOString(), balance: initialBalance }];
                 const comboResult = {
                    combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve, strategies: individualResults.map(r => r.strategyName) },
                    individualResults
                 };
                console.log(`[Orchestrator] COMBO backtest (Mode: ${mlMode}) finished.`);
                return comboResult; // Return combo result directly

            } else {
                // --- SINGLE MODE (TA or Hybrid) ---
                console.log(`[Orchestrator] Running SINGLE backtest. Mode: ${mlMode}`);
                const { code } = config;
                let strategyFunction = () => ({ signal: 'hold' });
                // Start with global, add specific from config.params, then add from DB
                let strategyParams = { ...globalParams, ...(config.params || {}) };
                let strategyName = 'N/A', strategyType = 'N/A';

                // Fetch strategy details ONLY if TA is involved
                if (mlMode !== 'on') {
                    if (!code) throw new Error("Strategy 'code' required for TA/Hybrid.");
                    const strategy = await Strategy.findOne({ userId, code }).lean();
                    if (!strategy) throw new Error(`Strategy '${code}' not found.`);
                    if (!strategy.params?.strategyType) throw new Error(`Strategy '${code}' missing params.`);

                    strategyFunction = getStrategy(strategy.params.strategyType);
                    if (!strategyFunction) throw new Error(`Function for '${strategy.params.strategyType}' not found.`);

                    // Apply DB params last
                    strategyParams = { ...strategyParams, ...strategy.params };
                    strategyName = strategy.name;
                    strategyType = strategy.params.strategyType;
                }

                if (mlMode === 'predictions') { // Adjust name/type for Hybrid
                    strategyName = `Hybrid: ${strategyName || 'TA'} + ${mlModel || 'ML'}`;
                    strategyType = 'hybrid';
                }

                 console.log(`[Orchestrator] Running simulation for: ${strategyName}`);
                const { closedTrades, equityCurve } = runSimulation({
                    candles, strategyFunction, strategyParams, // Use fully combined params
                    riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
                });
                const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

                // --- Prepare data for saving or returning ---
                const backtestData = {
                    userId, symbol, timeframe, initialBalance,
                    finalBalance: metrics.finalBalance, profit: metrics.totalProfit, totalTrades: metrics.totalTrades,
                    startDate: new Date(startDate).toISOString(),
                    endDate: new Date(endDate).toISOString(),
                    candlesTested: candles.length,
                    strategy: { name: strategyName, type: strategyType, params: strategyParams, mlModel: mlMode !== 'off' ? mlModel : null },
                    metrics,
                    equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })),
                    tradeHistory: closedTrades.map(t => ({ // Map to expected DB/Frontend structure
                        action: t.signal === 'buy' ? 'LONG' : 'SHORT',
                        entryPrice: t.entryPrice, exitPrice: t.exitPrice,
                        entryTime: t.entryTime instanceof Date ? t.entryTime.toISOString() : t.entryTime,
                        exitTime: t.exitTime instanceof Date ? t.exitTime.toISOString() : t.exitTime,
                        profit: t.profit, size: t.size, exitReason: t.exitReason,
                        mlEntrySignal: t.mlEntrySignal, mlEntryConfidence: t.mlEntryConfidence
                     })),
                };

                if (!simulateOnly) {
                    console.log(`[Orchestrator] Saving backtest result (Mode: ${mlMode}) to database.`);
                    return await Backtest.create(backtestData);
                }
                console.log(`[Orchestrator] Returning simulation-only result (Mode: ${mlMode}).`);
                return backtestData;
            }
        } // End if (mlMode !== 'on')

    } catch (error) {
        console.error(`[Orchestrator] Backtest failed: ${error.message}`);
        console.error(error.stack);
        // Rethrow a user-friendly error or handle appropriately
        throw new Error(`Backtest Orchestration Failed: ${error.message}`);
    }
};
