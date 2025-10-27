// File: services/backtestService.js
// FINAL VERSION:
// - Fetches pre-calculated results for Pure ML mode ('on').
// - Uses original Node.js simulation for Pure TA ('off').
// - Uses original Node.js simulation + ML server calls for Hybrid ('predictions').
// UPDATED: ML_SERVER_URL changed to HTTP and port 8001, removed httpsAgent.

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";
import axios from "axios";
import { parse } from "csv-parse"; // Keep for Hybrid mode feature parsing
// import https from 'https'; // REMOVED - Not needed for HTTP
import { finished } from 'stream/promises'; // Keep for Hybrid mode feature parsing
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const ML_SERVER_URL = "http://74.208.28.77:8001"; // UPDATED to http and port 8001
// --------------------------------------------------------

// REMOVED - Not needed for HTTP
// const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Fetches the model's configuration (like feature list) from the ML server.
 * (Needed for Hybrid mode)
 */
const _getMLConfig = async (modelName, authToken) => {
    const config_url = `${ML_SERVER_URL}/api/ml/config/${modelName}`;
    console.log(`[ML] Fetching config for model: ${modelName} from ${config_url}`);
    const headers = {};
    if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }

    try {
        // REMOVED httpsAgent
        const response = await axios.get(config_url, { headers });
        if (!response.data || !response.data.features || !Array.isArray(response.data.features)) {
            throw new Error("Invalid config format received from ML server.");
        }
        console.log(`[ML] Received ${response.data.features.length} feature names for ${modelName}.`);
        return response.data;
    } catch (error) {
        let errorMessage = `Failed to fetch ML config for ${modelName}.`;
        // Added connection refused check
        if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server running at ${ML_SERVER_URL}?`;}
        else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.data?.error || error.response.statusText}`; }
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
    const data_filename = `${symbol.replace('/', '')}-${timeframe}-features.csv`; // Ensure symbol slashes are removed for filename
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
             if (context.column === 'datetime') return value; // Keep datetime string
             const num = Number(value);
             // More robust check for numbers, handling empty strings
             if (!isNaN(num) && value !== null && String(value).trim() !== '') return num;
             return value; // Return original if not clearly a number
         }
    });

    parser.on('readable', () => {
         let record;
         while ((record = parser.read()) !== null) {
             const row_ms = new Date(record.datetime).getTime();
             if (isNaN(row_ms)) continue; // Skip rows with invalid date
             if (row_ms >= start_ms && row_ms <= end_ms) {
                 // Ensure numeric fields are numbers post-parsing
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
        // REMOVED httpsAgent
        const response = await axios.get(data_url, { responseType: 'stream', timeout: 300000 }); // 5 min timeout
        response.data.pipe(parser);
        await finished(parser); // Wait for stream to end
        if (filteredData.length === 0) { throw new Error(`No historical feature data found for the selected date range (${startDate} to ${endDate}) in ${data_filename}.`); }
        console.log(`[ML] Found ${filteredData.length} feature rows for Hybrid Mode date range.`);
        return filteredData;
    } catch (error) {
        let errorMessage = `Failed to stream feature file from ${data_url}.`;
        // Added connection refused check
        if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server running at ${ML_SERVER_URL}?`;}
        else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.data?.error || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server.`; }
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

        // REMOVED httpsAgent
        const response = await axios.post(bulk_url, payload, { headers, timeout: 180000 }); // 3 min timeout

        // Ensure predictions format is consistent { prediction: X, probability: Y }
        const predictions = response.data.predictions.map(p => {
            if (typeof p === 'number') {
                return { prediction: p, probability: 1.0 }; // Assume 100% if only label
            } else if (p && p.prediction !== undefined && p.probability !== undefined) {
                return p; // Correct format
            } else {
                console.warn("[ML] Unexpected prediction format received:", p);
                return { prediction: 0, probability: 0.0 }; // Default to hold/low confidence
            }
        });
        console.log(`[ML] Received ${predictions.length} predictions for Hybrid Mode.`);
        return predictions;
    } catch (error) {
        let errorMessage = `Bulk prediction failed for model ${modelName} (Hybrid).`;
         // Added connection refused check
         if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server running at ${ML_SERVER_URL}?`;}
        else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.data?.error || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server.`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Bulk prediction failed for Hybrid: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


/**
 * --- SIMULATION ENGINE ---
 * (Used by Pure TA and Hybrid modes - unchanged functionally from your provided version)
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
        mlThreshold = 0.5 // Default threshold
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

    // Load Filter Strategies if params exist
    const trendFilterPeriod = strategyParams?.trendFilterPeriod;
    const minAtrPct = strategyParams?.minAtrPct;

    let trendFilterStrategy = null;
    if (trendFilterPeriod && trendFilterPeriod > 0) {
        trendFilterStrategy = getStrategy("Moving Average"); // Assumes registered name
        if (!trendFilterStrategy) console.warn("Warning: Trend filter specified but 'Moving Average' strategy not found.");
    }

    let atrStrategy = null;
    if (minAtrPct && minAtrPct > 0) {
        atrStrategy = getStrategy("ATR"); // Assumes registered name
        if (!atrStrategy) console.warn("Warning: Volatility filter specified but 'ATR' strategy not found.");
    }

    const isSignalHighConfidence = (mlPrediction) => {
        if (!mlThreshold || mlThreshold <= 0) return true; // Threshold 0 or less means ignore confidence
        if (typeof mlPrediction !== 'object' || typeof mlPrediction.probability !== 'number' || isNaN(mlPrediction.probability)) return false; // Invalid prediction
        return mlPrediction.probability >= mlThreshold;
    };

    // Correctly map ML Server prediction (0, 1, 2) to internal signal (-1, 0, 1)
    const getMLSignalLabel = (mlPrediction) => {
        if (mlPrediction === null || mlPrediction === undefined) return 0; // Hold if no prediction
        const rawPrediction = mlPrediction?.prediction !== undefined ? mlPrediction.prediction : mlPrediction;
        // Assuming ML Server uses 0=Sell, 1=Hold, 2=Buy (mapped from Python's -1, 0, 1)
        if (rawPrediction === 0) return -1; // Sell
        if (rawPrediction === 1) return 0;  // Hold
        if (rawPrediction === 2) return 1;  // Buy
        // Log unexpected values but default to hold
        // console.warn(`[Simulation] Unexpected raw ML prediction value encountered: ${rawPrediction}`);
        return 0;
    };

    // --- Main Simulation Loop ---
    for (let i = 1; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
        // Validate candle data
        if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) {
            console.warn(`[Simulation] Skipping candle ${i} due to invalid data:`, candles[i]);
            continue;
        }
        const historicalCandles = candles.slice(0, i + 1);

        // Get ML signal for the current candle (if applicable)
        const currentMLPrediction = mlPredictions?.[i];
        const mlSignal = getMLSignalLabel(currentMLPrediction); // Gets -1, 0, or 1

        // --- 1. Check for Exits ---
        if (position) {
            let exitPrice = null;
            let exitReason = '';
            const { slPrice, tpPrice, signal: entrySignal } = position; // entrySignal is 'buy' or 'sell'

            // A. Check for ML Exit Signal (Reverse Signal based on confidence)
            if ((mlMode === 'on' || mlMode === 'predictions') && currentMLPrediction && isSignalHighConfidence(currentMLPrediction)) {
                if (mlSignal === -1 && entrySignal === 'buy') { // ML says Sell while Long
                    exitPrice = close; exitReason = 'ML Exit Signal (Reverse)';
                } else if (mlSignal === 1 && entrySignal === 'sell') { // ML says Buy while Short
                    exitPrice = close; exitReason = 'ML Exit Signal (Reverse)';
                }
            }

            // B. Check for SL/TP if no ML exit yet
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

            // C. Process the Exit if an exit condition was met
            if (exitPrice !== null) {
                // Sanitize exit price - use close if calculated SL/TP is somehow invalid
                exitPrice = (typeof exitPrice !== 'number' || isNaN(exitPrice) || !isFinite(exitPrice)) ? close : exitPrice;

                const pnl = (exitPrice - position.entryPrice) * position.size * (entrySignal === 'buy' ? 1 : -1);
                currentBalance += pnl;

                // Update position details before pushing to closedTrades
                position.exitTime = new Date(timestamp);
                position.exitPrice = exitPrice;
                position.profit = pnl;
                position.exitReason = exitReason;
                closedTrades.push({ ...position }); // Store a copy
                equityCurve.push({ timestamp, balance: currentBalance });
                position = null; // Clear current position

                // Check for bankruptcy
                if (currentBalance <= 0) {
                    console.warn('[Simulation] Account balance reached zero or below. Ending simulation.');
                    break;
                }
            }
        } // End if (position) - Exit Check

        // --- 2. Check for Entries ---
        // Only check if not currently in a position and have balance
        if (!position && currentBalance > 0) {

            // A. Volatility Filter (ATR Check)
            if (atrStrategy && minAtrPct > 0) {
                try {
                    const atrResult = atrStrategy(historicalCandles, { period: 14 }); // Assuming standard 14 period
                    const atrValue = atrResult?.value;
                    if (typeof atrValue === 'number' && !isNaN(atrValue) && close > 0) {
                        const atrPercent = (atrValue / close) * 100;
                        if (atrPercent < minAtrPct) {
                            // console.log(`[DEBUG: Filter] Skipping trade ${i}. ATR ${atrPercent.toFixed(2)}% < Threshold ${minAtrPct}%`);
                            continue; // Skip entry if market volatility is too low
                        }
                    } else if (close <= 0) {
                         console.warn(`[Simulation] ATR filter skipped at candle ${i} due to zero or negative close price.`);
                    }
                } catch (e) {
                    console.warn(`[Simulation] ATR volatility filter failed at candle ${i}: ${e.message}`);
                    // Decide if failure should block trade: continue; or allow trade attempt
                }
            }

            // B. Get Signals (TA and ML)
            let taSignal = 'hold'; // TA signal ('buy', 'sell', 'hold')
            let finalSignal = 'hold'; // Final decision ('buy', 'sell', 'hold')
            let mlEntrySignal = 0; // ML signal (-1, 0, 1) after confidence check

            // Get TA Signal (if required by mode)
            if (mlMode === 'off' || mlMode === 'predictions') {
                if (!strategyFunction) {
                    console.error("[Simulation] TA/Hybrid mode selected but strategyFunction is missing.");
                    continue; // Cannot proceed without a strategy function
                }
                try {
                    const taResult = strategyFunction(historicalCandles, strategyParams);
                    // Ensure strategy returns an object like { signal: 'buy' } or just the signal string
                    taSignal = (typeof taResult === 'object' && taResult !== null) ? taResult.signal : taResult;
                    taSignal = ['buy', 'sell'].includes(taSignal) ? taSignal : 'hold'; // Sanitize
                } catch (strategyError) {
                    console.error(`[Simulation] Strategy function crashed at ${new Date(timestamp).toISOString()} (candle ${i}):`, strategyError.message);
                    continue; // Skip candle if strategy fails
                }
            }

            // Get and Filter ML Signal (if required by mode)
            if (mlMode === 'on' || mlMode === 'predictions') {
                if (!currentMLPrediction) {
                     // console.log(`[DEBUG] No ML prediction available at index ${i}`);
                     mlEntrySignal = 0; // Treat missing prediction as hold signal
                } else if (isSignalHighConfidence(currentMLPrediction)) {
                    mlEntrySignal = mlSignal; // Use the -1, 0, 1 signal
                } else {
                    mlEntrySignal = 0; // Low confidence = hold signal
                }
            }

            // C. Determine Final Signal based on Mode
            const hybridMode = strategyParams?.hybridMode || 'AND'; // Default to AND
            const mlIsBuy = (mlEntrySignal === 1); // Check for explicit Buy (1)
            const mlIsSell = (mlEntrySignal === -1); // Check for explicit Sell (-1)

            if (mlMode === 'off') {
                finalSignal = taSignal; // Pure TA mode just uses the TA signal
            }
            else if (mlMode === 'on') {
                // Pure ML Mode
                if (mlIsBuy) { finalSignal = 'buy'; }
                else if (mlIsSell) { finalSignal = 'sell'; }
                else { finalSignal = 'hold'; } // Explicitly hold if ML signal is 0

                // Apply Trend Regime Filter (if configured)
                if (trendFilterStrategy && finalSignal !== 'hold' && trendFilterPeriod > 0) {
                    try {
                        const taRegimeResult = trendFilterStrategy(historicalCandles, { period: trendFilterPeriod });
                        const taRegime = taRegimeResult?.signal || 'hold'; // Assuming SMA strategy gives 'buy'/'sell'/'hold'
                        if ((finalSignal === 'buy' && taRegime !== 'buy') || (finalSignal === 'sell' && taRegime !== 'sell')) {
                            // console.log(`[DEBUG Filter ${i}] ML ${finalSignal} blocked by TA Trend Filter (${taRegime})`);
                            finalSignal = 'hold'; // Override ML signal if trend filter disagrees
                        }
                    } catch (e) {
                        console.warn(`[Simulation] Trend regime filter failed at candle ${i}: ${e.message}`);
                        // Decide if filter failure should block trade: finalSignal = 'hold'; or allow
                    }
                }
            }
            else if (mlMode === 'predictions') { // Hybrid Mode
                if (hybridMode === 'Regime') {
                    // TA as Regime Filter, ML as Entry Signal
                    const taRegime = taSignal;
                    if (mlIsBuy && taRegime === 'buy') { finalSignal = 'buy'; }
                    else if (mlIsSell && taRegime === 'sell') { finalSignal = 'sell'; }
                    else { finalSignal = 'hold'; } // Hold if signals don't align with regime
                } else if (hybridMode === 'OR') {
                    // TA OR ML (Permissive)
                    if (taSignal === 'buy' || mlIsBuy) { finalSignal = 'buy'; }
                    else if (taSignal === 'sell' || mlIsSell) { finalSignal = 'sell'; }
                    else { finalSignal = 'hold'; }
                } else { // AND (Default)
                    // TA AND ML (Strict)
                    if (taSignal === 'buy' && mlIsBuy) { finalSignal = 'buy'; }
                    else if (taSignal === 'sell' && mlIsSell) { finalSignal = 'sell'; }
                    else { finalSignal = 'hold'; } // Hold if signals don't agree
                }
            }

            // D. Execute Entry if Signal is Buy or Sell
            if (finalSignal === 'buy' || finalSignal === 'sell') {
                // --- Position Sizing Logic ---
                // Validate SL/TP inputs (use defaults if missing or invalid)
                const slPercentInput = strategyParams?.SL;
                const tpPercentInput = strategyParams?.TP;
                const parsedSL = (typeof slPercentInput === 'number' && !isNaN(slPercentInput) && slPercentInput > 0) ? slPercentInput : 1.0; // Default SL 1%
                const parsedTP = (typeof tpPercentInput === 'number' && !isNaN(tpPercentInput) && tpPercentInput > 0) ? tpPercentInput : 2.0; // Default TP 2%

                // Use a minimum SL for sizing calculation to avoid division by zero/extreme sizes
                const sizingSL = Math.max(0.1, parsedSL); // Min SL 0.1% for sizing robustness

                // Determine effective risk percentage
                let effectiveRiskPercent = riskPercentage;
                if (isInGrowthMode) {
                     if (currentBalance >= growthCapitalTarget) {
                         isInGrowthMode = false; // Turn off growth mode
                         console.log(`[Simulation] Growth target $${growthCapitalTarget} reached. Switching to standard risk ${riskPercentage}%.`);
                     } else {
                         effectiveRiskPercent = 100; // All-in if below target in growth mode
                     }
                }
                const riskDecimal = Math.max(0, Math.min(1, effectiveRiskPercent / 100)); // Ensure between 0 and 1
                const stopLossDecimal = sizingSL / 100;

                // Calculate position size in quote currency ($)
                let positionSizeDollars = (currentBalance * riskDecimal) / stopLossDecimal;
                // Ensure we don't try to use more balance than available
                positionSizeDollars = Math.min(positionSizeDollars, currentBalance);

                // Convert to base currency units
                const positionSizeUnits = close > 0 ? positionSizeDollars / close : 0;

                // Only enter if size is valid
                if (positionSizeUnits > 0) {
                    // Calculate SL/TP prices based on entry price (close)
                    const slPrice = finalSignal === 'buy' ? close * (1 - parsedSL / 100) : close * (1 + parsedSL / 100);
                    const tpPrice = finalSignal === 'buy' ? close * (1 + parsedTP / 100) : close * (1 - parsedTP / 100);

                    // Create the position object
                    position = {
                        entryPrice: close,
                        entryTime: new Date(timestamp),
                        size: positionSizeUnits,
                        signal: finalSignal, // Store 'buy' or 'sell'
                        slPrice: slPrice,
                        tpPrice: tpPrice,
                        // Store initial ML info if available
                        mlEntrySignal: mlMode !== 'off' ? mlEntrySignal : null, // Store -1, 0, 1
                        mlEntryConfidence: mlMode !== 'off' ? currentMLPrediction?.probability : null
                    };
                    // Optional debug log for entry
                    // console.log(`[DEBUG Entry ${i}] ${finalSignal.toUpperCase()} @ ${close.toFixed(2)}. Size: ${positionSizeUnits.toFixed(4)}. Bal: ${currentBalance.toFixed(2)}. SL: ${slPrice.toFixed(2)}, TP: ${tpPrice.toFixed(2)}`);

                    // Deduct position value from balance (conceptually, funds are now in the position)
                    // Note: This backtester uses full balance for simplicity; real systems might use margin
                    // currentBalance -= positionSizeDollars; // Optional: Reduce cash balance if tracking separately

                } else {
                    // Log why entry was skipped if size calculation failed
                    // console.log(`[DEBUG No Entry ${i}] Calculated size ≤ 0. Balance: ${currentBalance.toFixed(2)}, Close: ${close.toFixed(2)}, RiskDec: ${riskDecimal}, SLDec: ${stopLossDecimal}`);
                }
            } // End if finalSignal is buy or sell
        } // End if (!position && currentBalance > 0) - Entry Check

        // --- Update Equity Curve (End of Candle) ---
        // If not already updated by an exit, record equity at candle close
        if (!position && equityCurve[equityCurve.length - 1].timestamp !== timestamp) {
             equityCurve.push({ timestamp, balance: currentBalance });
        } else if (position && equityCurve[equityCurve.length - 1].timestamp !== timestamp) {
             // If in position, equity is current value of position
             const positionValue = position.size * close;
             equityCurve.push({ timestamp, balance: positionValue }); // Assuming no cash held while in position
        }

    } // End main simulation loop

    // --- Final Equity Point Calculation ---
    // Ensure the equity curve extends to the very last candle's timestamp
    if (candles.length > 0) {
        const lastTimestamp = candles[candles.length - 1][0];
        const lastClose = candles[candles.length - 1][4];
        let finalRecordedEquity = currentBalance; // Default to cash balance if flat

        if (position) { // If still in a position at the end
            console.log(`[Simulation] Ending in ${position.signal} position entered at ${position.entryPrice}. Closing at last candle close: ${lastClose}`);
            // Calculate final PnL based on last close (no SL/TP check here)
            const finalPnl = (lastClose - position.entryPrice) * position.size * (position.signal === 'buy' ? 1 : -1);
            finalRecordedEquity = (position.entryPrice * position.size) + finalPnl; // Final equity = initial value + PnL

            // Optionally add a final "closed" trade record for analysis
             position.exitTime = new Date(lastTimestamp);
             position.exitPrice = lastClose;
             position.profit = finalPnl;
             position.exitReason = 'End of Backtest';
             closedTrades.push({ ...position }); // Add the final forced closure

        }

        // Add or update the last equity point
        if (equityCurve.length === 0 || equityCurve[equityCurve.length - 1].timestamp !== lastTimestamp) {
            equityCurve.push({ timestamp: lastTimestamp, balance: finalRecordedEquity });
        } else {
             // If last point already exists, update its balance
             equityCurve[equityCurve.length - 1].balance = finalRecordedEquity;
        }
         currentBalance = finalRecordedEquity; // Update currentBalance to reflect final equity
    }

    console.log(`[Simulation] Finished. Total Trades Recorded: ${closedTrades.length}. Final Equity: $${currentBalance?.toFixed(2) || 'N/A'}`);
    return { closedTrades, equityCurve };
};


/**
 * Calculates metrics. (Unchanged)
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    // ... (This function remains exactly as before) ...
    // Includes: Input validation, calculating finalBalance, totalProfit, win/loss trades,
    // gross profit/loss, max drawdown %, win rate, avg win/loss, profit factor.
    // Handles Infinity profit factor.
    if (!equityCurve || equityCurve.length === 0 || typeof initialBalance !== 'number' || isNaN(initialBalance)) { /* ... */ return { /* zeroed */ }; }
    const finalBalance = equityCurve[equityCurve.length - 1].balance;
    if (typeof finalBalance !== 'number' || isNaN(finalBalance)) { /* ... */ return { /* zeroed */ }; }
    const totalProfit = finalBalance - initialBalance;
    const winningTrades = trades.filter(t => t.profit > 0); const losingTrades = trades.filter(t => t.profit <= 0);
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0); const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
    let peakBalance = -Infinity; let maxDrawdownPercent = 0;
    equityCurve.forEach(point => { /* ... calculate max drawdown % ... */
        if (typeof point.balance !== 'number' || isNaN(point.balance)) return;
        if (point.balance > peakBalance) peakBalance = point.balance;
        const currentDrawdownPercent = peakBalance > 0 ? ((peakBalance - point.balance) / peakBalance) * 100 : 0;
        if (currentDrawdownPercent > maxDrawdownPercent) maxDrawdownPercent = currentDrawdownPercent;
    });
    const totalTrades = trades.length; const metrics = { /* ... */ };
    metrics.initialBalance=initialBalance; metrics.finalBalance=finalBalance; metrics.totalProfit=totalProfit;
    metrics.totalReturn = initialBalance!==0 ? (totalProfit/initialBalance)*100 : 0;
    metrics.totalTrades=totalTrades; metrics.winningTrades=winningTrades.length; metrics.losingTrades=losingTrades.length;
    metrics.winRate = totalTrades>0 ? (winningTrades.length/totalTrades)*100 : 0;
    metrics.averageWin = winningTrades.length>0 ? grossProfit/winningTrades.length : 0;
    metrics.averageLoss = losingTrades.length>0 ? grossLoss/losingTrades.length : 0;
    metrics.profitFactor = grossLoss>0 ? grossProfit/grossLoss : (grossProfit>0 ? Infinity : null);
    metrics.maxDrawdown = maxDrawdownPercent;
    if (metrics.profitFactor === Infinity) { metrics.profitFactor = null; }
    console.log(`[Metrics] Calculated: Trades: ${metrics.totalTrades}, Win Rate: ${metrics.winRate?.toFixed(2)}%, PF: ${metrics.profitFactor?.toFixed(2) ?? 'N/A'}, Max DD: ${metrics.maxDrawdown?.toFixed(2)}%, Final Balance: $${metrics.finalBalance?.toFixed(2)}`);
    return metrics;
};

/**
 * Aggregates metrics for combo tests. (Unchanged)
 */
const _aggregateMetrics = (individualResults, initialBalance) => {
    // ... (This function remains exactly as before) ...
    // Includes: Input validation, summing trades/wins/losses, gross profit/loss,
    // calculating final balance, total return, win rate, avg win/loss, profit factor, avg max drawdown.
    // Handles Infinity profit factor.
    if (!individualResults || individualResults.length === 0) { return { /* zeroed aggregate */ }; }
    const totalTrades = individualResults.reduce((sum,r)=>sum+(r.metrics?.totalTrades||0),0);
    const winningTrades = individualResults.reduce((sum,r)=>sum+(r.metrics?.winningTrades||0),0);
    const losingTrades = totalTrades - winningTrades;
    const grossProfit = individualResults.reduce((sum,r)=>sum+((r.metrics?.averageWin||0)*(r.metrics?.winningTrades||0)),0);
    const grossLoss = individualResults.reduce((sum,r)=>sum+((r.metrics?.averageLoss||0)*(r.metrics?.losingTrades||0)),0);
    const totalProfit = grossProfit - grossLoss; const finalBalance = initialBalance + totalProfit;
    const totalReturn = initialBalance!==0 ? (totalProfit/initialBalance)*100 : 0;
    const winRate = totalTrades>0 ? (winningTrades/totalTrades)*100 : 0;
    let profitFactor = grossLoss>0 ? grossProfit/grossLoss : (grossProfit>0 ? Infinity : null);
    const avgMaxDrawdown = individualResults.length>0 ? individualResults.reduce((sum,r)=>sum+(r.metrics?.maxDrawdown||0),0)/individualResults.length : 0;
    if (profitFactor === Infinity) profitFactor = null;
    return { /* ... aggregated metrics ... */ };
};


/**
 * --- MASTER ORCHESTRATOR ---
 * Final Version: Fetches pre-calculated results for Pure ML mode ('on').
 * Uses Node.js simulation for Pure TA ('off') and Hybrid ('predictions').
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log("[runBacktest] Starting orchestrator with config:", JSON.stringify(config, null, 2));

    const isComboTest = config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0;
    const initialBalance = parseFloat(config.initialBalance || 1000);
    if (isNaN(initialBalance) || initialBalance <= 0) { throw new Error(`Invalid Initial Balance: ${config.initialBalance}`); }

    const {
        userId, symbol, timeframe, startDate, endDate,
        mlMode = 'off', mlModel, mlThreshold, ...otherParams
    } = config;

    const riskParams = { /* ... extract risk params ... */
        riskManagementMode: config.riskManagementMode, riskPercentage: config.riskPercentage, growthCapitalTarget: config.growthCapitalTarget
    };
    const globalParams = config.params || {};

    let candles;
    let mlPredictions = null;
    let dynamicFeatureNames = [];

    try {
        // --- STEP 1: Handle Different Modes ---

        if (mlMode === 'on') {
            // --- ✅ PURE ML MODE ---
            console.log(`[Orchestrator] Fetching pre-calculated ML backtest results for model: ${mlModel || 'default'}`);
            try {
                const port = process.env.PORT || 5000;
                // UPDATED: Use HTTP
                const internalApiUrl = `http://127.0.0.1:${port}/api/ml/ml-backtest-results`;
                console.log(`[Orchestrator] Calling internal API: ${internalApiUrl}`);

                // REMOVED httpsAgent
                const response = await axios.get(internalApiUrl);
                const mlResult = response.data;

                if (!mlResult || typeof mlResult !== 'object' || !mlResult.initial_balance) { throw new Error("Invalid data from internal ML results endpoint."); }
                console.log("[Orchestrator] Successfully fetched pre-calculated ML results.");

                // --- Format the result ---
                const formattedResult = { /* ... format mlResult ... */
                    userId, symbol, timeframe, initialBalance: mlResult.initial_balance,
                    finalBalance: mlResult.final_balance, profit: mlResult.final_balance - mlResult.initial_balance,
                    totalTrades: mlResult.total_trades, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(),
                    candlesTested: mlResult.equity_curve?.length || 0,
                    strategy: { name: `ML: ${mlModel || 'Default'}`, type: 'ml', params: { ...globalParams, mlThreshold: mlThreshold }, mlModel: mlModel || 'Default' },
                    metrics: {
                        initialBalance: mlResult.initial_balance, finalBalance: mlResult.final_balance,
                        totalProfit: mlResult.final_balance - mlResult.initial_balance, totalReturn: mlResult.total_profit_pct,
                        totalTrades: mlResult.total_trades,
                        winningTrades: Math.round(mlResult.total_trades * (mlResult.win_rate / 100)),
                        losingTrades: Math.round(mlResult.total_trades * (1 - (mlResult.win_rate / 100))),
                        winRate: mlResult.win_rate, averageWin: 0, averageLoss: 0, // Calculate below
                        profitFactor: mlResult.profit_factor === Infinity ? null : mlResult.profit_factor,
                        maxDrawdown: mlResult.max_drawdown_pct
                    },
                    equityCurve: mlResult.equity_curve.map(p => ({ timestamp: p.time, balance: p.equity })),
                    tradeHistory: mlResult.trades.map(t => ({ /* ... format trade history ... */
                        action: t.action, price: t.price, time: t.time, size: t.size, pnl_pct: t.pnl_pct, profit: t.profit_usd || 0,
                        entryTime: t.action === 'buy' ? t.time : null, exitTime: t.action === 'sell' ? t.time : null,
                        exitReason: t.action === 'sell' ? 'ML Signal/Logic' : null,
                    })),
                };

                // Calculate Avg Win/Loss from detailed trades
                const finalTrades = formattedResult.tradeHistory.filter(t => t.action === 'sell' && typeof t.profit === 'number');
                const finalWinning = finalTrades.filter(t => t.profit > 0);
                const finalLosing = finalTrades.filter(t => t.profit <= 0);
                if (finalWinning.length > 0) { formattedResult.metrics.averageWin = finalWinning.reduce((sum, t) => sum + t.profit, 0) / finalWinning.length; }
                if (finalLosing.length > 0) { formattedResult.metrics.averageLoss = Math.abs(finalLosing.reduce((sum, t) => sum + t.profit, 0)) / finalLosing.length; }

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
                 else if (error.request) { console.error("No response received from internal API. Is the backend running locally?"); }
                 else { console.error("Error Setup:", error.message); }
                throw new Error(`Failed to retrieve ML backtest results via internal API. Error: ${error.message}`);
            }

        } else if (mlMode === 'predictions') {
            // --- HYBRID MODE (Using Node.js simulation - Unchanged from your original) ---
            console.log(`[Orchestrator] Running HYBRID backtest via Node.js simulation.`);
            // ... (Your existing logic as provided: _getMLConfig, _getFeatureData, map candles, align features, _getBulkPredictions) ...
            if (!mlModel) throw new Error("ML Model name required for Hybrid.");
            const mlConfig = await _getMLConfig(mlModel, authToken);
            dynamicFeatureNames = mlConfig.features;
            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);
            candles = fullFeatureData.map(row => { /* ... extract candles ... */
                const timestamp = new Date(row.datetime).getTime(); const open=Number(row.open); const high=Number(row.high); const low=Number(row.low); const close=Number(row.close);
                if ([timestamp,open,high,low,close].some(isNaN)) return null; return [timestamp,open,high,low,close];
            }).filter(Boolean);
            if (!candles || candles.length < 2) throw new Error("Not enough candle data for Hybrid.");
            const validTimestamps = new Set(candles.map(c => c[0]));
            const alignedFeatureData = fullFeatureData.filter(row => validTimestamps.has(new Date(row.datetime).getTime()));
            const features = alignedFeatureData.map(row => dynamicFeatureNames.map(f => Number(row[f])||0));
            if (features.length !== candles.length) { throw new Error(`Hybrid alignment failed: Candles ${candles.length}, Features ${features.length}`); }
            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
            if (mlPredictions.length !== candles.length) { throw new Error(`Hybrid prediction count mismatch: Candles ${candles.length}, Predictions ${mlPredictions.length}`); }
            console.log(`[Orchestrator] Hybrid Prep Complete.`);
            // Continue below...

        } else { // mlMode === 'off'
             // --- ✅ ORIGINAL PURE TA MODE --- (Unchanged from your original)
             console.log(`[Orchestrator] Pure TA mode detected. Fetching OHLCV data.`);
             const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
             if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for the selected period.");
             candles = data.candles;
             console.log(`[Orchestrator] Fetched ${candles.length} candles for Pure TA.`);
             // Continue below...
        }


        // --- STEP 2: Execute Simulation(s) (Only for TA and Hybrid) ---
        if (mlMode !== 'on') {
            if (isComboTest) {
                // --- COMBO MODE (TA or Hybrid - Unchanged from your original) ---
                console.log(`[Orchestrator] Running COMBO backtest. Mode: ${mlMode}`);
                // ... (Your existing combo logic: loop strategies, combine params, runSimulation, aggregate results) ...
                const individualResults = [];
                for (const stratConfig of config.strategies) { /* ... */
                    const { closedTrades, equityCurve } = runSimulation({ /* ... */ });
                    const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);
                    individualResults.push({ /* ... */ });
                }
                const comboResult = { /* ... aggregate ... */ };
                return comboResult;

            } else {
                // --- SINGLE MODE (TA or Hybrid - Unchanged from your original) ---
                console.log(`[Orchestrator] Running SINGLE backtest. Mode: ${mlMode}`);
                // ... (Your existing single logic: find strategy, combine params, runSimulation, format backtestData) ...
                const { code } = config;
                let strategyFunction = () => ({ signal: 'hold' });
                let strategyParams = { ...globalParams, ...(config.params || {}) };
                let strategyName = 'N/A', strategyType = 'N/A';
                if (mlMode !== 'on') { /* ... fetch strategy details ... */
                    if (!code) throw new Error("Strategy 'code' required.");
                    const strategy = await Strategy.findOne({ userId, code }).lean();
                    // ... (rest of strategy fetching/validation) ...
                    strategyFunction = getStrategy(strategy.params.strategyType);
                    strategyParams = { ...strategyParams, ...strategy.params };
                    strategyName = strategy.name; strategyType = strategy.params.strategyType;
                }
                if (mlMode === 'predictions') { /* ... update name/type ... */ }

                console.log(`[Orchestrator] Running simulation for: ${strategyName}`);
                const { closedTrades, equityCurve } = runSimulation({ /* ... */ });
                const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);
                const backtestData = { /* ... format for saving/returning ... */
                     userId, symbol, timeframe, initialBalance,
                     finalBalance: metrics.finalBalance, profit: metrics.totalProfit, totalTrades: metrics.totalTrades,
                     startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(),
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
