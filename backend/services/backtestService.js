// File: services/backtestService.js
// UPGRADED: Full support for Pure TA, Pure ML, and Hybrid (TA+ML) backtesting.
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
// ⚠️ FEATURE_NAMES constant is now REMOVED. It will be fetched dynamically.
// --------------------------------------------------------

// Agent to ignore SSL errors for the self-signed certificate on the ML server
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * NEW: Fetches the model's configuration (like feature list) from the ML server.
 */
const _getMLConfig = async (modelName, authToken) => {
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
 * Assumes dates are consistently formatted (e.g., UTC).
 */
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    const data_filename = `${symbol}-${timeframe}-features.csv`;
    const data_url = `${ML_SERVER_URL}/data/${data_filename}`;
    console.log(`[ML] Streaming feature data from: ${data_url}`);

    // Standardize boundary dates
    const start_dt = new Date(startDate);
    const end_dt = new Date(endDate);
    end_dt.setUTCHours(23, 59, 59, 999); // Ensure end date includes the full day

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
            // Filter using UTC timestamps for consistency
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
            throw new Error(`No historical feature data found for the selected date range (${startDate} to ${endDate}).`);
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
 * Gets bulk ML predictions, accepting and using the Authorization header.
 * Assumes prediction data includes a probability field if mlThreshold is needed.
 */
const _getBulkPredictions = async (modelName, features, authToken) => {
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
        
        // Structure predictions for thresholding: [{ prediction: X, probability: Y }, ...]
        const predictions = response.data.predictions.map(p => {
            if (typeof p === 'number') { // Simple class label output
                return { prediction: p, probability: 1.0 }; // Assume max confidence
            }
            return p; // Assume { prediction: X, probability: Y } format
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
 * --- MODIFIED SIMULATION ENGINE ---
 * UPGRADE: Added ML Threshold filter logic.
 * UPGRADE: Added robustness checks for SL/TP price validity.
 */
const runSimulation = (config) => {
    const {
        candles,
        strategyFunction,
        strategyParams,
        riskParams,
        initialBalance, // Guaranteed number from runBacktest
        mlMode,
        mlPredictions,
        mlThreshold // Passed from orchestrator
    } = config;
    
    console.log(`[Simulation] ML Threshold set to: ${mlThreshold}`); // DEBUG
    console.log(`[Simulation] Starting simulation. Mode: ${mlMode}. Candles: ${candles.length}. Predictions: ${mlPredictions?.length || 0}`);
    console.log(`[Simulation] Initial Balance: $${initialBalance.toFixed(2)}. Risk: ${riskParams.riskPercentage}%`); // DEBUG

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

    // Helper function for ML Threshold check
    const isSignalHighConfidence = (mlPrediction) => {
        if (!mlThreshold || mlThreshold <= 0) return true; // No threshold filtering
        if (typeof mlPrediction !== 'object' || mlPrediction.probability === undefined) return true; // Simple prediction format
        return mlPrediction.probability >= mlThreshold; // Check probability
    };
    
    // Helper function to get the numeric prediction label
    const getMLSignalLabel = (mlPrediction) => {
        return mlPrediction?.prediction !== undefined ? mlPrediction.prediction : mlPrediction;
    };


    // Main Simulation Loop - Start from 1 to have history for indicators
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

            // 🛑 ML Exit Logic: Check confidence *before* acting on reverse signal
            if ((mlMode === 'on' || mlMode === 'predictions') && currentMLPrediction && isSignalHighConfidence(currentMLPrediction)) {
                
                // Exit if ML signals sell (-1) when long
                if (mlSignal === -1 && signal === 'buy') {
                    exitPrice = close; exitReason = 'ML Exit Signal (Reverse)';
                    console.log(`[DEBUG: Exit] ML Reverse Exit (Buy -> Sell) at ${new Date(timestamp).toISOString()}, Price: ${exitPrice}`);
                } 
                // Exit if ML signals buy (1 or 2) when short
                else if ((mlSignal === 1 || mlSignal === 2) && signal === 'sell') { 
                    exitPrice = close; exitReason = 'ML Exit Signal (Reverse)';
                    console.log(`[DEBUG: Exit] ML Reverse Exit (Sell -> Buy) at ${new Date(timestamp).toISOString()}, Price: ${exitPrice}`);
                }
            }

            // Check SL/TP and overwrite if triggered - Robustness Check
            if (exitPrice === null) {
                // Ensure slPrice and tpPrice are valid numbers before comparison
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
                // Robustness: Ensure exitPrice is a valid number before PnL calc
                if (typeof exitPrice !== 'number' || isNaN(exitPrice)) {
                    console.error(`[Simulation Error] Invalid exitPrice calculated: ${exitPrice}. Skipping trade closure.`);
                    continue; // Skip this exit calculation
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
            let mlEntrySignal = 0; // Use a clean variable for threshold-filtered ML signal

            // A. Get TA Signal (if applicable)
            if (mlMode === 'off' || mlMode === 'predictions') {
                if (!strategyFunction) { console.error("[Simulation] TA mode selected but strategyFunction is missing."); continue; }
                try {
                    taSignal = strategyFunction(historicalCandles, strategyParams)?.signal || 'hold';
                } catch (strategyError) { console.error(`[Simulation] Strategy Crash at ${new Date(timestamp).toISOString()}:`, strategyError.message); continue; }
            }

            // B. Get and Filter ML Signal (if applicable)
            if (mlMode === 'on' || mlMode === 'predictions') {
                if (!currentMLPrediction) { continue; }
                // 🛑 UPGRADE: Apply Threshold Filter
                if (isSignalHighConfidence(currentMLPrediction)) { mlEntrySignal = mlSignal; }
                 else { mlEntrySignal = 0; } // Below threshold, treat as HOLD
            }

            // C. Determine Final Signal based on Mode
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
            
            // DEBUG Log
            if (mlMode === 'predictions' || mlMode === 'on') {
                const confidence = currentMLPrediction?.probability !== undefined ? currentMLPrediction.probability.toFixed(3) : 'N/A';
                console.log(`[DEBUG: Signal] Time: ${new Date(timestamp).toISOString()}. Mode: ${mlMode}. TA: ${taSignal}. ML: ${mlSignal} (Conf: ${confidence}). Final: ${finalSignal}`);
            }

            if (finalSignal === 'buy' || finalSignal === 'sell') {
                // Use defensive defaults for SL/TP params.
                const { SL: slPercentInput = 1.0, TP: tpPercentInput = 2.0 } = strategyParams || {};
                const parsedSL = parseFloat(slPercentInput) || 0; 
                const parsedTP = parseFloat(tpPercentInput) || 0;
                
                // Enforce minimum SL for position sizing (1%) even if user sets 0
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
                    // Set extremely far-out prices if SL or TP were 0/missing in input.
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
    // Basic validation
    if (!equityCurve || equityCurve.length === 0 || typeof initialBalance !== 'number' || isNaN(initialBalance)) {
        console.warn("[Metrics] Invalid input (empty equity curve or non-numeric initial balance). Returning zeroed metrics.");
        return { initialBalance: initialBalance || 0, finalBalance: initialBalance || 0, totalProfit: 0, totalReturn: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 };
    }

    const finalBalance = equityCurve[equityCurve.length - 1].balance;
    // Robustness: ensure finalBalance is also a number
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
        if (typeof point.balance !== 'number' || isNaN(point.balance)) return; // Skip invalid points
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
        // Handle division by zero for profit factor
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null), 
        maxDrawdown: maxDrawdownPercent,
    };
    
    console.log(`[Metrics] Total Trades: ${metrics.totalTrades}, Win Rate: ${metrics.winRate.toFixed(2)}%, Final Balance: $${metrics.finalBalance.toFixed(2)}`);
    return metrics;
};

/**
 * --- HEAVILY MODIFIED ORCHESTRATOR ---
 * Orchestrates a backtest, now handling all 3 ML modes and authentication.
 * UPGRADED: Streamlined data fetching. Added parameter validation.
 * UPGRADED: Fetches feature list dynamically.
 */
export const runBacktest = async (config, authToken) => { // ACCEPTS authToken
    console.log("[runBacktest] Starting orchestrator with config:", config);
    const {
        userId, code, symbol, timeframe, startDate, endDate,
        simulateOnly = true, mlMode = 'off', mlModel, mlThreshold, ...riskParams
    } = config;

    let candles;
    let mlPredictions = null;
    let strategyFunction = null;
    let strategyParams = { ...(config.params || {}) };
    let strategyName = 'N/A', strategyType = 'N/A';
    let dynamicFeatureNames = []; // Store dynamic features here

    try {
        // --- STEP 1: Fetch Strategy (if TA or Hybrid) ---
        if (mlMode === 'off' || mlMode === 'predictions') {
            if (!code) throw new Error("Strategy 'code' is required for TA or Hybrid mode.");
            const strategy = await Strategy.findOne({ userId, code }).lean();
            if (!strategy) throw new Error(`Strategy with code '${code}' not found.`);

            // 🛑 Robustness: Basic Strategy Parameter Validation
            if (!strategy.params || !strategy.params.strategyType) {
                 throw new Error(`Strategy '${code}' is missing required parameters (e.g., strategyType).`);
            }

            strategyFunction = getStrategy(strategy.params.strategyType);
            if (!strategyFunction) {
                 throw new Error(`Could not load strategy function for type: ${strategy.params.strategyType}`);
            }
            strategyParams = { ...strategy.params, ...(config.params || {}) };
            strategyName = strategy.name;
            strategyType = strategy.params.strategyType;
            console.log(`[Orchestrator] TA Strategy loaded: ${strategyName} (Type: ${strategyType})`);
        }

        // --- STEP 2: Fetch Data & ML Predictions (Streamlined Logic) ---
        if (mlMode === 'on' || mlMode === 'predictions') {
            // ML or Hybrid: Fetch feature data (includes candle data) and predictions
            if (!mlModel) throw new Error("ML Model name ('mlModel') is required for ML or Hybrid mode.");
            console.log(`[Orchestrator] ML/Hybrid mode detected. Model: ${mlModel}.`);

            // 🛑 UPGRADE: Fetch dynamic config first
            const mlConfig = await _getMLConfig(mlModel, authToken);
            dynamicFeatureNames = mlConfig.features; // Get feature list from server
            // You could also use mlConfig.horizon here if needed

            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);

            // Extract candles
            candles = fullFeatureData.map(row => {
                 const timestamp = new Date(row.datetime).getTime();
                 const { open, high, low, close } = row;
                 if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) return null;
                 return [timestamp, open, high, low, close];
            }).filter(candle => candle !== null);
            
            if (!candles || candles.length < 2) throw new Error("Not enough valid candle data in feature file.");
            
            // Extract features using the DYNAMIC feature list
            const features = fullFeatureData
                .filter(row => !isNaN(new Date(row.datetime).getTime()))
                .map(row => dynamicFeatureNames.map(feature => { // Use dynamic list here
                    const val = row[feature];
                    return (typeof val !== 'number' || isNaN(val)) ? 0 : val; // Default missing features to 0
                }));
            
             // 🛑 Robustness: Empty Feature Check
            if (features.length === 0) throw new Error("No valid features extracted from the data.");
            if (features.length !== candles.length) throw new Error(`Data mismatch: Candles (${candles.length}), Features (${features.length}).`);

            // Get predictions
            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
            if (mlPredictions.length !== candles.length) throw new Error(`Prediction count mismatch: Candles (${candles.length}), Predictions (${mlPredictions.length}).`);
            
            console.log(`[Orchestrator] Fetched ${candles.length} candles/features & ${mlPredictions.length} predictions.`);

            if (mlMode === 'on') {
                strategyName = `ML: ${mlModel}`;
                strategyType = 'ml';
                strategyFunction = () => ({ signal: 'hold' }); // Dummy function for Pure ML
            } else { // Hybrid mode
                strategyName = `Hybrid: ${strategyName} + ${mlModel}`;
                strategyType = 'hybrid';
            }

        } else {
            // Pure TA mode: Only fetch basic candle data
            console.log(`[Orchestrator] Pure TA mode detected. Fetching OHLCV data.`);
            const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
            if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for the selected period.");
            candles = data.candles;
            console.log(`[Orchestrator] Fetched ${candles.length} candles for Pure TA.`);
        }
        
        // Final configuration log before simulation
        // 🛑 FIX INTEGRATED HERE: Ensure initialBalance is a number
        const initialBalance = parseFloat(config.initialBalance || strategyParams.initialBalance || 1000); 
        if (isNaN(initialBalance) || initialBalance <= 0) {
            throw new Error(`Invalid Initial Balance provided: ${config.initialBalance}`);
        }
        console.log(`[Orchestrator] Final Config: Mode: ${mlMode}, Strategy: ${strategyName}, Initial Balance: $${initialBalance}`);

        // --- STEP 3: Run the Simulation ---
        const { closedTrades, equityCurve } = runSimulation({
            candles,
            strategyFunction,
            strategyParams,
            riskParams,
            initialBalance,
            mlMode,
            mlPredictions,
            mlThreshold // Pass the threshold
        });

        // --- STEP 4: Calculate Final Metrics ---
        const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

        // --- STEP 5: Prepare Result Object ---
        const backtestData = {
            userId, symbol, timeframe, initialBalance,
            finalBalance: metrics.finalBalance, profit: metrics.totalProfit, totalTrades: metrics.totalTrades,
            startDate: new Date(startDate).toISOString(), // Standardize dates to UTC ISO strings
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

        // --- STEP 6: Save to DB or Return ---
        if (!simulateOnly) {
            console.log(`[Orchestrator] Saving backtest result to database.`); // DEBUG
            return await Backtest.create(backtestData);
        }
        console.log(`[Orchestrator] Returning simulation-only result.`); // DEBUG
        return backtestData;
    } catch (error) {
        console.error(`[Orchestrator] Backtest failed with a critical error: ${error.message}`); // DEBUG
        // console.error(error.stack); // Uncomment for detailed stack traces
        throw error; // Re-throw the error to be handled by the caller
    }
};
