// File: services/backtestService.js
// UPGRADED: runBacktest now orchestrates BOTH Single and Hybrid-Combo modes.
// UPGRADED: ML signal 2 is now interpreted as a Buy signal in all ML modes.
// UPGRADED: Hybrid mode now uses "TA OR ML" (permissive) logic for entries.
// UPGRADED: Integrated ML Threshold check.
// UPGRADED: Added robustness checks (SL/TP validation, param validation, empty features).
// UPGRADED: Streamlined data fetching logic.
// UPGRADE: FEATURE_NAMES are now fetched dynamically from the ML server.
// FIX: Uses streams for CSV parsing to prevent memory errors (OOM).
// FIX: Correctly forwards the JWT token to the Python ML server (401 fix).
// FIX: Corrected metrics calculation to prevent NaN database error (WinRate fix).
// FIX: Added explicit exit logic for Pure ML/Hybrid mode (1/2=Buy, 0=Hold, -1=Sell).
// FIX: Added parseFloat to initialBalance to prevent NaN in final profit metrics.

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";
import axios from "axios";
import { parse } from "csv-parse"; // Use the stream parser
import https from 'https';
import { finished } from 'stream/promises'; // For stream handling

// --- CONFIGURATION ---
const ML_SERVER_URL = "https://74.208.28.77:8000";
// --------------------------------------------------------

// Agent to ignore SSL errors for the self-signed certificate on the ML server
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * NEW: Fetches the model's configuration (like feature list) from the ML server.
 */
const _getMLConfig = async (modelName, authToken) => {
    // ... (This function is unchanged from the previous step)
    const config_url = `${ML_SERVER_URL}/api/ml/config/${modelName}`;
    console.log(`[ML] Fetching config for model: ${modelName}`);
    
    const headers = {};
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await axios.get(config_url, {
            httpsAgent: httpsAgent,
            headers: headers
        });
        
        if (!response.data || !response.data.features || !Array.isArray(response.data.features)) {
            throw new Error("Invalid config format received from ML server.");
        }
        
        console.log(`[ML] Received ${response.data.features.length} feature names for ${modelName}.`);
        return response.data; // Expects { features: [...], horizon: X, ... }

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
 * Downloads and parses the feature file using streams to save memory.
 */
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    // ... (This function is unchanged from the previous step)
    const data_filename = `${symbol}-${timeframe}-features.csv`;
    const data_url = `${ML_SERVER_URL}/data/${data_filename}`;
    console.log(`[ML] Streaming feature data from: ${data_url}`);

    const start_dt = new Date(startDate);
    const end_dt = new Date(endDate);
    end_dt.setUTCHours(23, 59, 59, 999); 

    const filteredData = [];

    const parser = parse({
        columns: true,
        skip_empty_lines: true,
        cast: true
    });

    parser.on('readable', () => {
        let record;
        while ((record = parser.read()) !== null) {
            const row_dt = new Date(record.datetime);
            if (isNaN(row_dt.getTime())) continue;
            if (row_dt.getTime() >= start_dt.getTime() && row_dt.getTime() <= end_dt.getTime()) {
                filteredData.push(record);
            }
        }
    });

    parser.on('error', (err) => {
        throw new Error(`Failed to parse CSV data: ${err.message}`);
    });

    try {
        const response = await axios.get(data_url, {
            responseType: 'stream',
            httpsAgent: httpsAgent
        });

        response.data.pipe(parser);
        await finished(parser);

        if (filteredData.length === 0) {
            throw new Error(`No historical feature data found for the selected date range (${startDate} to ${endDate}). Check if the data file exists on the server for this range.`);
        }
        console.log(`[ML] Found ${filteredData.length} feature rows for the date range.`);
        return filteredData;

    } catch (error) {
        let errorMessage = `Failed to stream feature file from ${data_url}.`;
        if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server. Is it running?`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Failed to stream feature file: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};

/**
 * Gets bulk ML predictions
 */
const _getBulkPredictions = async (modelName, features, authToken) => {
    // ... (This function is unchanged from the previous step)
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`;
    console.log(`[ML] Getting bulk predictions for ${modelName} (${features.length} samples})...`);

    try {
        const payload = { model_name: modelName, features: features };
        const headers = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        } else {
            console.warn("[ML] WARNING: No auth token provided for bulk prediction call.");
        }

        const response = await axios.post(bulk_url, payload, {
            httpsAgent: httpsAgent,
            headers: headers
        });
        
        const predictions = response.data.predictions.map(p => {
            if (typeof p === 'number') { 
                return { prediction: p, probability: 1.0 }; 
            }
            return p;
        });

        console.log(`[ML] Received ${predictions.length} predictions.`);
        return predictions;

    } catch (error) {
        let errorMessage = `Bulk prediction failed for model ${modelName}.`;
        if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server. Is it running?`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Bulk prediction failed: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


/**
 * --- SIMULATION ENGINE ---
 */
const runSimulation = (config) => {
    // ... (This function is unchanged from the previous step)
    const {
        candles,
        strategyFunction,
        strategyParams,
        riskParams,
        initialBalance, 
        mlMode,
        mlPredictions,
        mlThreshold 
    } = config;
    
    console.log(`[Simulation] ML Threshold set to: ${mlThreshold}`); 
    console.log(`[Simulation] Starting simulation. Mode: ${mlMode}. Candles: ${candles.length}. Predictions: ${mlPredictions?.length || 0}`);
    console.log(`[Simulation] Initial Balance: $${initialBalance.toFixed(2)}. Risk: ${riskParams.riskPercentage}%`); 

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
    } = riskParams;

    let isInGrowthMode = (riskManagementMode === 'dynamic' && initialBalance < growthCapitalTarget);

    const isSignalHighConfidence = (mlPrediction) => {
        if (!mlThreshold || mlThreshold <= 0) return true; 
        if (typeof mlPrediction !== 'object' || mlPrediction.probability === undefined) return true; 
        return mlPrediction.probability >= mlThreshold; 
    };
    
    const getMLSignalLabel = (mlPrediction) => {
        return mlPrediction?.prediction !== undefined ? mlPrediction.prediction : mlPrediction;
    };

    for (let i = 1; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
        if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) {
            console.warn(`[Simulation] Skipping candle ${i} due to invalid data:`, candles[i]);
            continue;
        }
        const historicalCandles = candles.slice(0, i + 1);
        
        const currentMLPrediction = mlPredictions?.[i];
        const mlSignal = getMLSignalLabel(currentMLPrediction);

        // --- 1. Check for Exits ---
        if (position) {
            let exitPrice = null;
            let exitReason = '';
            const { slPrice, tpPrice, signal } = position;

            if ((mlMode === 'on' || mlMode === 'predictions') && currentMLPrediction && isSignalHighConfidence(currentMLPrediction)) {
                if (mlSignal === -1 && signal === 'buy') {
                    exitPrice = close; exitReason = 'ML Exit Signal (Reverse)';
                    console.log(`[DEBUG: Exit] ML Reverse Exit (Buy -> Sell) at ${new Date(timestamp).toISOString()}, Price: ${exitPrice}`);
                } 
                else if ((mlSignal === 1 || mlSignal === 2) && signal === 'sell') { 
                    exitPrice = close; exitReason = 'ML Exit Signal (Reverse)';
                    console.log(`[DEBUG: Exit] ML Reverse Exit (Sell -> Buy) at ${new Date(timestamp).toISOString()}, Price: ${exitPrice}`);
                }
            }

            if (exitPrice === null) {
                const validSlPrice = typeof slPrice === 'number' && !isNaN(slPrice) && isFinite(slPrice);
                const validTpPrice = typeof tpPrice === 'number' && !isNaN(tpPrice) && isFinite(tpPrice);
                if (signal === 'buy') {
                    if (validSlPrice && low <= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                    else if (validTpPrice && high >= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
                } else if (signal === 'sell') {
                    if (validSlPrice && high >= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                    else if (validTpPrice && low <= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
                }
            }

            if (exitPrice !== null) {
                if (typeof exitPrice !== 'number' || isNaN(exitPrice)) {
                    console.error(`[Simulation Error] Invalid exitPrice calculated: ${exitPrice}. Skipping trade closure.`);
                    continue; 
                }
                const pnl = (exitPrice - position.entryPrice) * position.size * (signal === 'buy' ? 1 : -1);
                currentBalance += pnl;

                position.exitTime = new Date(timestamp);
                position.exitPrice = exitPrice;
                position.profit = pnl;
                position.exitReason = exitReason;
                closedTrades.push({ ...position });
                equityCurve.push({ timestamp, balance: currentBalance });
                
                console.log(`[DEBUG: Trade Exit] ${signal.toUpperCase()} closed at ${exitPrice.toFixed(2)} (${exitReason}). PnL: $${pnl.toFixed(2)}. New Balance: $${currentBalance.toFixed(2)}`);
                position = null;
                if (currentBalance <= 0) {
                    console.warn('[Simulation] Account wiped out. Ending simulation.');
                    break;
                }
            }
        }

        // 2. Check for Entries
        if (!position) {
            let taSignal = 'hold';
            let finalSignal = 'hold';
            let mlEntrySignal = 0; 

            if (mlMode === 'off' || mlMode === 'predictions') {
                if (!strategyFunction) { console.error("[Simulation] TA mode selected but strategyFunction is missing."); continue; }
                try {
                    taSignal = strategyFunction(historicalCandles, strategyParams)?.signal || 'hold';
                } catch (strategyError) { console.error(`[Simulation] Strategy Crash at ${new Date(timestamp).toISOString()}:`, strategyError.message); continue; }
            }

            if (mlMode === 'on' || mlMode === 'predictions') {
                if (!currentMLPrediction) { continue; }
                if (isSignalHighConfidence(currentMLPrediction)) { mlEntrySignal = mlSignal; }
                 else { mlEntrySignal = 0; } 
            }

            // Determine Final Signal
            if (mlMode === 'off') { finalSignal = taSignal; }
            else if (mlMode === 'on') { // PURE ML
                if (mlEntrySignal === 1 || mlEntrySignal === 2) { finalSignal = 'buy'; }
                else if (mlEntrySignal === -1) { finalSignal = 'sell'; }
            }
            else if (mlMode === 'predictions') { // Hybrid 'OR' Logic
                const mlIsBuy = (mlEntrySignal === 1 || mlEntrySignal === 2);
                const mlIsSell = (mlEntrySignal === -1);
                if (taSignal === 'buy' || mlIsBuy) { finalSignal = 'buy'; }
                else if (taSignal === 'sell' || mlIsSell) { finalSignal = 'sell'; }
            }
            
            if (mlMode === 'predictions' || mlMode === 'on') {
                const confidence = currentMLPrediction?.probability !== undefined ? currentMLPrediction.probability.toFixed(3) : 'N/A';
                console.log(`[DEBUG: Signal] Time: ${new Date(timestamp).toISOString()}. Mode: ${mlMode}. TA: ${taSignal}. ML: ${mlSignal} (Conf: ${confidence}). Final: ${finalSignal}`);
            }

            if (finalSignal === 'buy' || finalSignal === 'sell') {
                const { SL: slPercentInput = 1.0, TP: tpPercentInput = 2.0 } = strategyParams || {};
                const parsedSL = parseFloat(slPercentInput) || 0; 
                const parsedTP = parseFloat(tpPercentInput) || 0;
                const sizingSL = Math.max(1, parsedSL); 

                let effectiveRiskPercent = riskPercentage;
                if (isInGrowthMode) {
                    if (currentBalance >= growthCapitalTarget) { isInGrowthMode = false; effectiveRiskPercent = riskPercentage; }
                     else { effectiveRiskPercent = 100; console.log(`[DEBUG: Risk] In Growth Mode. Risk set to 100%.`); }
                }

                const riskDecimal = Math.max(0, Math.min(1, effectiveRiskPercent / 100));
                const stopLossDecimal = sizingSL / 100;

                let positionSizeDollars = (currentBalance * riskDecimal) / stopLossDecimal;
                positionSizeDollars = Math.min(positionSizeDollars, currentBalance);
                const positionSizeUnits = close > 0 ? positionSizeDollars / close : 0;

                 if (positionSizeUnits > 0) {
                    const farPriceSL = finalSignal === 'buy' ? 0 : Infinity;
                    const farPriceTP = finalSignal === 'buy' ? Infinity : 0;
                    
                    const slPrice = (parsedSL > 0) ? (finalSignal === 'buy' ? close * (1 - parsedSL / 100) : close * (1 + parsedSL / 100)) : farPriceSL;
                    const tpPrice = (parsedTP > 0) ? (finalSignal === 'buy' ? close * (1 + parsedTP / 100) : close * (1 - parsedTP / 100)) : farPriceTP;

                    position = {
                        entryPrice: close, entryTime: new Date(timestamp), size: positionSizeUnits,
                        signal: finalSignal, slPrice: slPrice, tpPrice: tpPrice,
                    };

                    const slLog = parsedSL > 0 ? slPrice.toFixed(2) : 'NONE';
                    const tpLog = parsedTP > 0 ? tpPrice.toFixed(2) : 'NONE';
                    console.log(`[DEBUG: Trade Entry] ${finalSignal.toUpperCase()} at ${close.toFixed(2)}. Size: ${positionSizeUnits.toFixed(4)}. SL: ${slLog}, TP: ${tpLog}`);
                 }
            }
        }
    }

    if (candles.length > 0) {
        const lastTimestamp = candles[candles.length - 1][0];
        if (equityCurve.length === 0 || equityCurve[equityCurve.length - 1].timestamp !== lastTimestamp) {
            equityCurve.push({ timestamp: lastTimestamp, balance: currentBalance });
        }
    }

    console.log(`[Simulation] Finished. Trades: ${closedTrades.length}. Final Balance: ${currentBalance.toFixed(2)}`);
    return { closedTrades, equityCurve };
};


/**
 * Calculates a comprehensive set of performance metrics from trades.
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    // ... (This function is unchanged from the previous step)
    if (!equityCurve || equityCurve.length === 0 || typeof initialBalance !== 'number' || isNaN(initialBalance)) {
        console.warn("[Metrics] Invalid input. Returning zeroed metrics.");
        return { initialBalance: initialBalance || 0, finalBalance: initialBalance || 0, totalProfit: 0, totalReturn: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 };
    }
    const finalBalance = equityCurve[equityCurve.length - 1].balance;
    if (typeof finalBalance !== 'number' || isNaN(finalBalance)) {
        console.error(`[Metrics Error] Final balance is not a valid number: ${finalBalance}. Using initial balance.`);
        return { initialBalance, finalBalance: initialBalance, totalProfit: 0, totalReturn: 0, totalTrades: trades.length, winningTrades: 0, losingTrades: trades.length, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 };
    }
    const totalProfit = finalBalance - initialBalance;
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0);
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
    let peakBalance = initialBalance;
    let maxDrawdownValue = 0;
    equityCurve.forEach(point => {
        if (typeof point.balance !== 'number' || isNaN(point.balance)) return;
        if (point.balance > peakBalance) peakBalance = point.balance;
        const drawdown = peakBalance - point.balance;
        if (drawdown > maxDrawdownValue) maxDrawdownValue = drawdown;
    });
    const maxDrawdownPercent = peakBalance > 0 ? (maxDrawdownValue / peakBalance) * 100 : 0;
    const totalTrades = trades.length;
    const metrics = {
        initialBalance, finalBalance, totalProfit,
        totalReturn: initialBalance !== 0 ? (totalProfit / initialBalance) * 100 : 0,
        totalTrades: totalTrades,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0, 
        averageWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
        averageLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null), 
        maxDrawdown: maxDrawdownPercent,
    };
    console.log(`[Metrics] Total Trades: ${metrics.totalTrades}, Win Rate: ${metrics.winRate.toFixed(2)}%, Final Balance: $${metrics.finalBalance.toFixed(2)}`);
    return metrics;
};

/**
 * NEW HELPER: Aggregates metrics from individual backtest results.
 * This is a simplified aggregation. A true portfolio combination would 
 * merge trades chronologically, which is much more complex.
 */
const _aggregateMetrics = (individualResults, initialBalance) => {
    if (!individualResults || individualResults.length === 0) {
        return {
            initialBalance, finalBalance: initialBalance, totalProfit: 0, totalReturn: 0,
            totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
            averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 // Cannot calculate combined drawdown easily
        };
    }

    // Sum up the core counting metrics
    const totalTrades = individualResults.reduce((sum, r) => sum + r.metrics.totalTrades, 0);
    const winningTrades = individualResults.reduce((sum, r) => sum + r.metrics.winningTrades, 0);
    const losingTrades = individualResults.reduce((sum, r) => sum + r.metrics.losingTrades, 0);
    
    // Calculate combined profit/loss
    const grossProfit = individualResults.reduce((sum, r) => sum + (r.metrics.averageWin * r.metrics.winningTrades), 0);
    const grossLoss = individualResults.reduce((sum, r) => sum + (r.metrics.averageLoss * r.metrics.losingTrades), 0);

    const totalProfit = grossProfit - grossLoss;
    const finalBalance = initialBalance + totalProfit;
    const totalReturn = initialBalance !== 0 ? (totalProfit / initialBalance) * 100 : 0;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null);

    // Note: MaxDrawdown cannot be accurately calculated this way. 
    // A true combined equity curve is needed. We'll use the average as a rough estimate.
    const avgMaxDrawdown = individualResults.reduce((sum, r) => sum + r.metrics.maxDrawdown, 0) / individualResults.length;

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
 * UPGRADED: Now handles BOTH single and combo backtest requests.
 */
export const runBacktest = async (config, authToken) => {
    console.log("[runBacktest] Starting orchestrator with config:", config);
    
    // 🛑 FIX: Check if this is a Combo test or Single test
    const isComboTest = config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0;
    
    // 🛑 FIX: Standardize initialBalance check
    const initialBalance = parseFloat(config.initialBalance || 1000);
    if (isNaN(initialBalance) || initialBalance <= 0) {
        throw new Error(`Invalid Initial Balance provided: ${config.initialBalance}`);
    }

    const {
        userId, symbol, timeframe, startDate, endDate,
        mlMode = 'off', mlModel, mlThreshold, ...riskParams
    } = config;

    let candles;
    let mlPredictions = null;
    let dynamicFeatureNames = [];

    try {
        // --- STEP 1: Fetch Shared Data (Candles / ML Data) ---
        // In ALL modes, we need data. Fetch the richest data required.
        if (mlMode === 'on' || mlMode === 'predictions') {
            // ML or Hybrid: Fetch feature data (includes candle data) and predictions
            if (!mlModel) throw new Error("ML Model name ('mlModel') is required.");
            
            const mlConfig = await _getMLConfig(mlModel, authToken);
            dynamicFeatureNames = mlConfig.features;

            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);

            // Extract candles
            candles = fullFeatureData.map(row => {
                 const timestamp = new Date(row.datetime).getTime();
                 const { open, high, low, close } = row;
                 if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) return null;
                 return [timestamp, open, high, low, close];
            }).filter(candle => candle !== null);
            
            if (!candles || candles.length < 2) throw new Error("Not enough valid candle data in feature file.");
            
            // Extract features
            const features = fullFeatureData
                .filter(row => !isNaN(new Date(row.datetime).getTime()))
                .map(row => dynamicFeatureNames.map(feature => {
                    const val = row[feature];
                    return (typeof val !== 'number' || isNaN(val)) ? 0 : val;
                }));
            
            if (features.length !== candles.length) throw new Error(`Data mismatch: Candles (${candles.length}), Features (${features.length}).`);

            // Get predictions
            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
            if (mlPredictions.length !== candles.length) throw new Error(`Prediction count mismatch: Candles (${candles.length}), Predictions (${mlPredictions.length}).`);
            
            console.log(`[Orchestrator] Fetched ${candles.length} candles/features & ${mlPredictions.length} predictions.`);
        
        } else {
            // Pure TA mode: Only fetch basic candle data
            console.log(`[Orchestrator] Pure TA mode detected. Fetching OHLCV data.`);
            const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
            if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for the selected period.");
            candles = data.candles;
            console.log(`[Orchestrator] Fetched ${candles.length} candles for Pure TA.`);
        }

        // --- STEP 2: Execute Simulation(s) ---

        if (isComboTest) {
            // --- COMBO MODE ---
            console.log(`[Orchestrator] Running COMBO backtest with ${config.strategies.length} strategies. Mode: ${mlMode}`);
            const individualResults = [];

            for (const stratConfig of config.strategies) {
                const { code, params: stratParams } = stratConfig;
                
                // Load the individual TA strategy
                if (!code) throw new Error("Strategy 'code' is required for all items in a combo test.");
                const strategy = await Strategy.findOne({ userId, code }).lean();
                if (!strategy) throw new Error(`Strategy with code '${code}' not found.`);
                if (!strategy.params || !strategy.params.strategyType) throw new Error(`Strategy '${code}' is missing required parameters (e.g., strategyType).`);

                const strategyFunction = getStrategy(strategy.params.strategyType);
                if (!strategyFunction) throw new Error(`Could not load strategy function for type: ${strategy.params.strategyType}`);

                // Combine DB params with per-backtest params
                const combinedParams = { ...strategy.params, ...stratParams };

                console.log(`[Orchestrator] Running simulation for: ${strategy.name}`);
                
                // Run simulation for this specific strategy
                const { closedTrades, equityCurve } = runSimulation({
                    candles,
                    strategyFunction,
                    strategyParams: combinedParams,
                    riskParams,
                    initialBalance,
                    mlMode,
                    mlPredictions,
                    mlThreshold
                });

                const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

                const backtestData = {
                    strategyName: strategy.name,
                    metrics,
                    equityCurve: equityCurve.map(p => ({ 
                        timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, 
                        balance: p.balance 
                    })),
                    // tradeHistory: closedTrades.map(t => ({ ... })) // Optionally include full history
                };
                individualResults.push(backtestData);
            }

            // Aggregate results
            const combinedMetrics = _aggregateMetrics(individualResults, initialBalance);
            
            // TODO: Generate a combined equity curve (this is complex and requires chronological merging)
            // For now, we'll return the curve of the first strategy as a placeholder
            const combinedEquityCurve = individualResults[0]?.equityCurve || [{ timestamp: new Date(startDate).toISOString(), balance: initialBalance }];

            const comboResult = {
                combinedResult: {
                    metrics: combinedMetrics,
                    equityCurve: combinedEquityCurve,
                    strategies: individualResults.map(r => r.strategyName)
                },
                individualResults
            };
            
            console.log(`[Orchestrator] COMBO backtest finished.`);
            return comboResult;

        } else {
            // --- SINGLE MODE ---
            console.log(`[Orchestrator] Running SINGLE backtest. Mode: ${mlMode}`);
            const { code } = config;
            let strategyFunction;
            let strategyParams = { ...(config.params || {}) };
            let strategyName = 'N/A', strategyType = 'N/A';

            if (mlMode === 'off' || mlMode === 'predictions') {
                if (!code) throw new Error("Strategy 'code' is required for TA or Hybrid mode.");
                const strategy = await Strategy.findOne({ userId, code }).lean();
                if (!strategy) throw new Error(`Strategy with code '${code}' not found.`);
                if (!strategy.params || !strategy.params.strategyType) throw new Error(`Strategy '${code}' is missing required parameters.`);
                
                strategyFunction = getStrategy(strategy.params.strategyType);
                if (!strategyFunction) throw new Error(`Could not load strategy function for type: ${strategy.params.strategyType}`);
                
                strategyParams = { ...strategy.params, ...(config.params || {}) };
                strategyName = strategy.name;
                strategyType = strategy.params.strategyType;
            } else if (mlMode === 'on') {
                strategyName = `ML: ${mlModel}`;
                strategyType = 'ml';
                strategyFunction = () => ({ signal: 'hold' }); // Dummy function
            }
            
            if (mlMode === 'predictions') {
                 strategyName = `Hybrid: ${strategyName} + ${mlModel}`;
                 strategyType = 'hybrid';
            }

            const { closedTrades, equityCurve } = runSimulation({
                candles,
                strategyFunction,
                strategyParams,
                riskParams,
                initialBalance,
                mlMode,
                mlPredictions,
                mlThreshold
            });

            const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

            const backtestData = {
                userId, symbol, timeframe, initialBalance,
                finalBalance: metrics.finalBalance, profit: metrics.totalProfit, totalTrades: metrics.totalTrades,
                startDate: new Date(startDate).toISOString(),
                endDate: new Date(endDate).toISOString(),
                candlesTested: candles.length,
                strategy: { name: strategyName, type: strategyType, params: strategyParams, mlModel: mlModel },
                metrics,
                equityCurve: equityCurve.map(p => ({ 
                    timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, 
                    balance: p.balance 
                })),
                tradeHistory: closedTrades.map(t => ({ 
                    ...t, 
                    entryTime: t.entryTime instanceof Date ? t.entryTime.toISOString() : t.entryTime, 
                    exitTime: t.exitTime instanceof Date ? t.exitTime.toISOString() : t.exitTime 
                })),
            };

            if (!simulateOnly) {
                console.log(`[Orchestrator] Saving backtest result to database.`);
                return await Backtest.create(backtestData);
            }
            console.log(`[Orchestrator] Returning simulation-only result.`);
            return backtestData;
        }

    } catch (error) {
        console.error(`[Orchestrator] Backtest failed with a critical error: ${error.message}`);
        console.error(error.stack); // Log the full stack trace for debugging
        throw error; // Re-throw the error to be handled by the caller
    }
};
