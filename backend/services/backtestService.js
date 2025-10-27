// File: services/backtestService.js
// UPGRADED: runBacktest now fetches pre-calculated results for Pure ML mode ('on').
// REMAINS: Runs simulations for Pure TA ('off') and Hybrid ('predictions') modes.

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
 * (Keep this function if needed for Hybrid mode or future ML features)
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
 * Downloads and parses the feature file using streams.
 * (Keep this function only if Hybrid mode remains using Node.js simulation)
 */
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    const data_filename = `${symbol.replace('/', '')}-${timeframe}-features.csv`; // Ensure symbol slashes are removed
    const data_url = `${ML_SERVER_URL}/data/${data_filename}`;
    console.log(`[ML] Streaming feature data from: ${data_url} for Hybrid Mode`);

    // Force Start Date to UTC midnight (00:00:00)
    const start_ms = new Date(startDate + 'T00:00:00.000Z').getTime();
    // Force End Date to the last millisecond of the day
    const end_ms = new Date(endDate + 'T23:59:59.999Z').getTime();

    if (isNaN(start_ms) || isNaN(end_ms)) {
        throw new Error("Invalid start or end date format received.");
    }

    const filteredData = [];
    const parser = parse({
        columns: true,
        skip_empty_lines: true,
        // Ensure CSV parser treats numbers as numbers where possible
        cast: (value, context) => {
            if (context.header) return value;
            if (context.column === 'datetime') return value; // Keep datetime as string for now
            // Try converting to number, handle empty strings and non-numeric safely
            const num = Number(value);
            if (!isNaN(num) && value !== null && String(value).trim() !== '') return num;
            return value; // Return original string if not a clear number
        }
    });

    parser.on('readable', () => {
        let record;
        while ((record = parser.read()) !== null) {
            // Convert CSV datetime string directly to milliseconds (UTC)
            const row_ms = new Date(record.datetime).getTime();

            if (isNaN(row_ms)) continue; // Skip rows with invalid dates

            // Check if the row's timestamp falls within the requested millisecond range
            if (row_ms >= start_ms && row_ms <= end_ms) {
                // Ensure numeric fields are numbers after parsing (important redundancy)
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
    parser.on('error', (err) => {
        throw new Error(`Failed to parse CSV data: ${err.message}`);
    });

    try {
        const response = await axios.get(data_url, {
            responseType: 'stream',
            httpsAgent: httpsAgent,
            timeout: 300000 // 5 minutes timeout for potentially large files
        });

        response.data.pipe(parser);
        await finished(parser); // Wait for the stream processing to complete

        if (filteredData.length === 0) {
            throw new Error(`No historical feature data found for the selected date range (${startDate} to ${endDate}). Check if the data file exists on the server for this range.`);
        }
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
 * (Keep this function only if Hybrid mode remains using Node.js simulation)
 */
const _getBulkPredictions = async (modelName, features, authToken) => {
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`;
    console.log(`[ML] Getting bulk predictions for ${modelName} (${features.length} samples}) for Hybrid Mode...`);
    try {
        const payload = { model_name: modelName, features: features };
        const headers = {};
        if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }
        else { console.warn("[ML] WARNING: No auth token provided for bulk prediction call."); }

        const response = await axios.post(bulk_url, payload, { httpsAgent, headers, timeout: 180000 }); // 3 min timeout for bulk predict

        // Ensure predictions format is consistent { prediction: X, probability: Y }
        const predictions = response.data.predictions.map(p => {
            if (typeof p === 'number') {
                // Handle cases where only prediction label might be returned
                return { prediction: p, probability: 1.0 }; // Assume 100% probability if not given
            } else if (p && p.prediction !== undefined && p.probability !== undefined) {
                return p; // Already in correct format
            } else {
                console.warn("[ML] Unexpected prediction format received:", p);
                return { prediction: 0, probability: 0.0 }; // Default to hold/low probability on error
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
        initialBalance, // Guaranteed number from runBacktest
        mlMode,
        mlPredictions,
        mlThreshold = 0.5 // Default threshold if not provided
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

    // Load Filter Strategies (used if params are passed)
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

    // Helper to check ML confidence
    const isSignalHighConfidence = (mlPrediction) => {
        if (!mlThreshold || mlThreshold <= 0) return true; // No threshold means always high confidence
        if (typeof mlPrediction !== 'object' || typeof mlPrediction.probability !== 'number' || isNaN(mlPrediction.probability)) return false; // Invalid prediction format
        return mlPrediction.probability >= mlThreshold;
    };

    // Helper to get ML signal label (handles different formats)
    const getMLSignalLabel = (mlPrediction) => {
        if (mlPrediction === null || mlPrediction === undefined) return 0; // Default to hold if no prediction
        // Python script returns -1, 0, 1. ML Server might return 0, 1, 2. Adjust if needed.
        // Assuming ML Server returns 0 (Loss), 1 (Hold), 2 (Win) mapped from Python's -1, 0, 1
        // Convert ML server response (0, 1, 2) back to (-1, 0, 1) for consistent logic
        const rawPrediction = mlPrediction?.prediction !== undefined ? mlPrediction.prediction : mlPrediction;
        if (rawPrediction === 0) return -1; // Loss/Sell
        if (rawPrediction === 1) return 0;  // Hold
        if (rawPrediction === 2) return 1;  // Win/Buy
        return 0; // Default to hold for unexpected values
    };


    // Main Simulation Loop
    for (let i = 1; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
        if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) {
            console.warn(`[Simulation] Skipping candle ${i} due to invalid data:`, candles[i]);
            continue;
        }
        const historicalCandles = candles.slice(0, i + 1);

        const currentMLPrediction = mlPredictions?.[i]; // Get prediction for the current candle index
        const mlSignal = getMLSignalLabel(currentMLPrediction); // Get -1, 0, or 1

        // --- 1. Check for Exits ---
        if (position) {
            let exitPrice = null;
            let exitReason = '';
            const { slPrice, tpPrice, signal: entrySignal } = position; // entrySignal is 'buy' or 'sell'

            // A. Check for ML Exit Signal (Reverse Signal)
            if ((mlMode === 'on' || mlMode === 'predictions') && currentMLPrediction && isSignalHighConfidence(currentMLPrediction)) {
                // If we are long ('buy') and ML gives a sell (-1)
                if (mlSignal === -1 && entrySignal === 'buy') {
                    exitPrice = close; exitReason = 'ML Exit Signal (Reverse)';
                }
                // If we are short ('sell') and ML gives a buy (1)
                else if (mlSignal === 1 && entrySignal === 'sell') {
                    exitPrice = close; exitReason = 'ML Exit Signal (Reverse)';
                }
            }

            // B. Check for SL/TP if no ML exit
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

            // C. Process the Exit
            if (exitPrice !== null) {
                if (typeof exitPrice !== 'number' || isNaN(exitPrice)) {
                    console.error(`[Simulation Error] Invalid exitPrice calculated: ${exitPrice}. Position:`, position);
                    // Decide whether to close at 'close' or skip
                    exitPrice = close; // Close at current close as fallback
                    exitReason += ' (Fallback Close)';
                    // continue; // Or skip closing this turn
                }
                const pnl = (exitPrice - position.entryPrice) * position.size * (entrySignal === 'buy' ? 1 : -1);
                currentBalance += pnl;

                position.exitTime = new Date(timestamp);
                position.exitPrice = exitPrice;
                position.profit = pnl;
                position.exitReason = exitReason;
                closedTrades.push({ ...position });
                equityCurve.push({ timestamp, balance: currentBalance });
                position = null;

                if (currentBalance <= 0) {
                    console.warn('[Simulation] Account wiped out. Ending simulation.');
                    break; // Stop simulation if balance is zero or less
                }
            }
        } // End if (position)

        // --- 2. Check for Entries ---
        if (!position && currentBalance > 0) { // Ensure balance > 0 before entering

            // A. Volatility Filter (ATR Check)
            if (atrStrategy && minAtrPct > 0) {
                try {
                    const atrResult = atrStrategy(historicalCandles, { period: 14 }); // Assuming standard 14 period
                    const atrValue = atrResult?.value;
                    if (typeof atrValue === 'number' && !isNaN(atrValue) && close > 0) {
                        const atrPercent = (atrValue / close) * 100;
                        if (atrPercent < minAtrPct) {
                            // console.log(`[DEBUG: Filter] Skipping trade ${i}. ATR ${atrPercent.toFixed(2)}% < Threshold ${minAtrPct}%`);
                            continue; // Skip entry if market is too flat
                        }
                    }
                } catch (e) {
                    console.warn(`[Simulation] ATR volatility filter failed at candle ${i}: ${e.message}`);
                }
            }

            // B. Get Signals (TA and ML)
            let taSignal = 'hold'; // TA signal ('buy', 'sell', 'hold')
            let finalSignal = 'hold'; // Final decision ('buy', 'sell', 'hold')
            let mlEntrySignal = 0; // ML signal (-1, 0, 1) after confidence check

            // Get TA Signal (if needed)
            if (mlMode === 'off' || mlMode === 'predictions') {
                if (!strategyFunction) { console.error("[Simulation] TA/Hybrid mode selected but strategyFunction is missing."); continue; }
                try {
                    // Ensure strategy returns an object like { signal: 'buy' }
                    const taResult = strategyFunction(historicalCandles, strategyParams);
                    taSignal = taResult?.signal || 'hold';
                } catch (strategyError) {
                    console.error(`[Simulation] Strategy Crash at ${new Date(timestamp).toISOString()} candle ${i}:`, strategyError.message);
                    continue; // Skip candle if strategy fails
                }
            }

            // Get and Filter ML Signal (if needed)
            if (mlMode === 'on' || mlMode === 'predictions') {
                if (!currentMLPrediction) {
                     // console.log(`[DEBUG] No ML prediction available at index ${i}`);
                     mlEntrySignal = 0; // Treat missing prediction as hold
                } else if (isSignalHighConfidence(currentMLPrediction)) {
                    mlEntrySignal = mlSignal; // Use the -1, 0, 1 signal
                } else {
                    mlEntrySignal = 0; // Low confidence means hold
                }
            }

            // C. Determine Final Signal based on Mode
            const hybridMode = strategyParams?.hybridMode || 'AND'; // Default to AND
            const mlIsBuy = (mlEntrySignal === 1); // Only check for explicit Buy (1)
            const mlIsSell = (mlEntrySignal === -1); // Only check for explicit Sell (-1)

            if (mlMode === 'off') {
                finalSignal = taSignal; // Pure TA
            }
            else if (mlMode === 'on') {
                // Pure ML Mode
                if (mlIsBuy) { finalSignal = 'buy'; }
                else if (mlIsSell) { finalSignal = 'sell'; }

                // Apply Trend Regime Filter to PURE ML
                if (trendFilterStrategy && finalSignal !== 'hold' && trendFilterPeriod > 0) {
                    try {
                        // Assuming SMA strategy returns { signal: 'buy'/'sell' } based on price vs SMA
                        const taRegimeResult = trendFilterStrategy(historicalCandles, { period: trendFilterPeriod });
                        const taRegime = taRegimeResult?.signal || 'hold';
                        if (finalSignal === 'buy' && taRegime !== 'buy') {
                            // console.log(`[DEBUG Filter ${i}] ML Buy blocked by TA Trend Filter (${taRegime})`);
                            finalSignal = 'hold'; // Block buy if trend is not up
                        } else if (finalSignal === 'sell' && taRegime !== 'sell') {
                             // console.log(`[DEBUG Filter ${i}] ML Sell blocked by TA Trend Filter (${taRegime})`);
                            finalSignal = 'hold'; // Block sell if trend is not down
                        }
                    } catch (e) {
                        console.warn(`[Simulation] Trend regime filter failed at candle ${i}: ${e.message}`);
                    }
                }
            }
            else if (mlMode === 'predictions') {
                // Hybrid Mode
                if (hybridMode === 'Regime') {
                    // TA as Regime Filter, ML as Entry Signal
                    const taRegime = taSignal; // Main TA strategy defines the allowed direction
                    if (mlIsBuy && taRegime === 'buy') { finalSignal = 'buy'; }
                    else if (mlIsSell && taRegime === 'sell') { finalSignal = 'sell'; }
                } else if (hybridMode === 'OR') {
                    // TA OR ML (Permissive)
                    if (taSignal === 'buy' || mlIsBuy) { finalSignal = 'buy'; }
                    else if (taSignal === 'sell' || mlIsSell) { finalSignal = 'sell'; }
                } else { // Default to AND
                    // TA AND ML (Strict)
                    if (taSignal === 'buy' && mlIsBuy) { finalSignal = 'buy'; }
                    else if (taSignal === 'sell' && mlIsSell) { finalSignal = 'sell'; }
                }
            }

            // D. Execute Entry if Signal is Buy or Sell
            if (finalSignal === 'buy' || finalSignal === 'sell') {
                // --- Position Sizing Logic ---
                // Validate SL/TP inputs (use defaults if invalid)
                const slPercentInput = strategyParams?.SL;
                const tpPercentInput = strategyParams?.TP;
                const parsedSL = (typeof slPercentInput === 'number' && !isNaN(slPercentInput) && slPercentInput > 0) ? slPercentInput : 1.0; // Default SL 1% if invalid
                const parsedTP = (typeof tpPercentInput === 'number' && !isNaN(tpPercentInput) && tpPercentInput > 0) ? tpPercentInput : 2.0; // Default TP 2% if invalid

                // Ensure SL is always positive for sizing calculation
                const sizingSL = Math.max(0.1, parsedSL); // Min SL 0.1% for sizing

                // Determine effective risk based on mode
                let effectiveRiskPercent = riskPercentage;
                if (isInGrowthMode) {
                    if (currentBalance >= growthCapitalTarget) {
                         isInGrowthMode = false; // Switch off growth mode
                         effectiveRiskPercent = riskPercentage; // Use standard risk %
                     } else {
                         effectiveRiskPercent = 100; // All-in during growth mode
                     }
                }
                const riskDecimal = Math.max(0, Math.min(1, effectiveRiskPercent / 100)); // Clamp between 0 and 1
                const stopLossDecimal = sizingSL / 100;

                // Calculate position size based on risk and stop loss distance
                let positionSizeDollars = (currentBalance * riskDecimal) / stopLossDecimal;
                positionSizeDollars = Math.min(positionSizeDollars, currentBalance); // Cannot risk more than available balance

                const positionSizeUnits = close > 0 ? positionSizeDollars / close : 0;

                if (positionSizeUnits > 0) {
                    // Calculate SL/TP prices (use defaults if percents were 0)
                    const slPrice = finalSignal === 'buy' ? close * (1 - parsedSL / 100) : close * (1 + parsedSL / 100);
                    const tpPrice = finalSignal === 'buy' ? close * (1 + parsedTP / 100) : close * (1 - parsedTP / 100);

                    position = {
                        entryPrice: close,
                        entryTime: new Date(timestamp),
                        size: positionSizeUnits,
                        signal: finalSignal, // 'buy' or 'sell'
                        slPrice: slPrice,
                        tpPrice: tpPrice,
                        // Add initial ML prediction info if relevant
                        mlEntrySignal: mlMode !== 'off' ? mlEntrySignal : null,
                        mlEntryConfidence: mlMode !== 'off' ? currentMLPrediction?.probability : null
                    };
                    // console.log(`[DEBUG Entry ${i}] ${finalSignal} @ ${close.toFixed(2)}. Size: ${positionSizeUnits.toFixed(4)}. SL: ${slPrice.toFixed(2)}, TP: ${tpPrice.toFixed(2)}`);
                } else {
                    // console.log(`[DEBUG No Entry ${i}] Calculated size was 0. Balance: ${currentBalance}, Close: ${close}`);
                }
            } // End if finalSignal buy/sell
        } // End if (!position)
    } // End main loop

    // Ensure last equity point is added
    if (candles.length > 0) {
        const lastTimestamp = candles[candles.length - 1][0];
        // Only add if it's not already the last point
        if (equityCurve.length === 0 || equityCurve[equityCurve.length - 1].timestamp !== lastTimestamp) {
            // If still in a position, calculate equity based on last close
            const lastClose = candles[candles.length - 1][4];
            const finalEquity = position ? (position.size * lastClose) : currentBalance;
            equityCurve.push({ timestamp: lastTimestamp, balance: finalEquity });
        }
    }

    console.log(`[Simulation] Finished. Trades: ${closedTrades.length}. Final Balance: ${equityCurve[equityCurve.length -1].balance.toFixed(2)}`);
    return { closedTrades, equityCurve };
};


/**
 * Calculates metrics.
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    if (!equityCurve || equityCurve.length === 0 || typeof initialBalance !== 'number' || isNaN(initialBalance)) {
        console.warn("[Metrics] Invalid input for calculation. Returning zeroed metrics.");
        return { initialBalance: initialBalance || 0, finalBalance: initialBalance || 0, totalProfit: 0, totalReturn: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 };
    }
    const finalBalance = equityCurve[equityCurve.length - 1].balance;
    if (typeof finalBalance !== 'number' || isNaN(finalBalance)) {
        console.error(`[Metrics Error] Final balance is not a valid number: ${finalBalance}. Using initial balance.`);
        // Return zeroed metrics but keep initial/final balance for context
        return { initialBalance, finalBalance: initialBalance, totalProfit: 0, totalReturn: 0, totalTrades: trades.length, winningTrades: 0, losingTrades: trades.length, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: 0 };
    }

    const totalProfit = finalBalance - initialBalance;
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0); // Include zero-profit trades as losses
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));

    // Calculate Max Drawdown from equity curve
    let peakBalance = -Infinity; // Start peak at negative infinity
    let maxDrawdownValue = 0;
    equityCurve.forEach(point => {
        if (typeof point.balance !== 'number' || isNaN(point.balance)) return; // Skip invalid points
        if (point.balance > peakBalance) peakBalance = point.balance;
        const drawdown = peakBalance > 0 ? (peakBalance - point.balance) / peakBalance : 0; // Calculate drawdown percentage
        if (drawdown * 100 > maxDrawdownValue) maxDrawdownValue = drawdown * 100; // Store as percentage
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
        averageLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0, // Use grossLoss here
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null), // Handle zero loss, return null if no profit either
        maxDrawdown: maxDrawdownValue, // Already calculated as percentage
    };

    // Replace Infinity with null for JSON compatibility if needed, or handle on frontend
    if (metrics.profitFactor === Infinity) {
        metrics.profitFactor = null; // Or keep Infinity and handle display on frontend
        console.log("[Metrics] Profit Factor is Infinity (no losing trades).");
    }

    console.log(`[Metrics] Calculated: Trades: ${metrics.totalTrades}, Win Rate: ${metrics.winRate?.toFixed(2)}%, PF: ${metrics.profitFactor?.toFixed(2) ?? 'N/A'}, Max DD: ${metrics.maxDrawdown?.toFixed(2)}%, Final Balance: $${metrics.finalBalance?.toFixed(2)}`);
    return metrics;
};


/**
 * Aggregates metrics for combo tests.
 */
const _aggregateMetrics = (individualResults, initialBalance) => {
    if (!individualResults || individualResults.length === 0) {
        return { /* Return zeroed aggregate metrics */ };
    }
    // Calculate aggregate metrics based on summing up individual trade counts, profits, losses
    const totalTrades = individualResults.reduce((sum, r) => sum + (r.metrics?.totalTrades || 0), 0);
    const winningTrades = individualResults.reduce((sum, r) => sum + (r.metrics?.winningTrades || 0), 0);
    const losingTrades = totalTrades - winningTrades; // More reliable than summing individual losses
    const grossProfit = individualResults.reduce((sum, r) => sum + ((r.metrics?.averageWin || 0) * (r.metrics?.winningTrades || 0)), 0);
    const grossLoss = individualResults.reduce((sum, r) => sum + ((r.metrics?.averageLoss || 0) * (r.metrics?.losingTrades || 0)), 0);

    const totalProfit = grossProfit - grossLoss;
    const finalBalance = initialBalance + totalProfit;
    const totalReturn = initialBalance !== 0 ? (totalProfit / initialBalance) * 100 : 0;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null);

    // Average the max drawdown percentage (simplistic approach)
    const avgMaxDrawdown = individualResults.length > 0
        ? individualResults.reduce((sum, r) => sum + (r.metrics?.maxDrawdown || 0), 0) / individualResults.length
        : 0;

     const aggregatedMetrics = {
        initialBalance, finalBalance, totalProfit, totalReturn,
        totalTrades, winningTrades, losingTrades, winRate,
        averageWin: winningTrades > 0 ? grossProfit / winningTrades : 0,
        averageLoss: losingTrades > 0 ? grossLoss / losingTrades : 0,
        profitFactor,
        maxDrawdown: avgMaxDrawdown
    };

    if (aggregatedMetrics.profitFactor === Infinity) {
        aggregatedMetrics.profitFactor = null; // Handle Infinity for JSON
    }
    return aggregatedMetrics;
};


/**
 * --- MASTER ORCHESTRATOR ---
 * UPGRADED: Fetches pre-calculated results for Pure ML mode ('on').
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log("[runBacktest] Starting orchestrator with config:", config);

    const isComboTest = config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0;

    const initialBalance = parseFloat(config.initialBalance || 1000);
    if (isNaN(initialBalance) || initialBalance <= 0) {
        throw new Error(`Invalid Initial Balance provided: ${config.initialBalance}`);
    }

    const {
        userId, symbol, timeframe, startDate, endDate,
        mlMode = 'off', mlModel, mlThreshold, ...otherParams // Use otherParams for flexibility
    } = config;

    // Combine potentially separate riskParams and general params from config root
    const riskParams = {
        riskManagementMode: config.riskManagementMode,
        riskPercentage: config.riskPercentage,
        growthCapitalTarget: config.growthCapitalTarget
    };
    const globalParams = config.params || {}; // Global filter params etc., directly from config.params

    let candles;
    let mlPredictions = null; // Still needed for Hybrid mode
    let dynamicFeatureNames = []; // Still needed for Hybrid mode

    try {
        // --- STEP 1: Handle Different Modes ---

        if (mlMode === 'on') {
            // --- ✅ NEW: PURE ML MODE ---
            // Fetch pre-calculated results from the internal API endpoint
            console.log(`[Orchestrator] Fetching pre-calculated ML backtest results for model: ${mlModel || 'default'}`);
            try {
                // Determine the base URL dynamically - adjust if needed for production
                const port = process.env.PORT || 5000; // Use environment variable or default
                // Use 127.0.0.1 which is often more reliable than 'localhost' in server environments
                const internalApiUrl = `http://127.0.0.1:${port}/api/ml/ml-backtest-results`;

                console.log(`[Orchestrator] Calling internal API: ${internalApiUrl}`);
                const response = await axios.get(internalApiUrl);
                const mlResult = response.data; // This is the content of backtest_results.json

                if (!mlResult || typeof mlResult !== 'object') {
                    throw new Error("Invalid data received from internal ML results endpoint.");
                }
                console.log("[Orchestrator] Successfully fetched pre-calculated ML results.");

                // --- Format the result to match the expected structure for saving/returning ---
                const formattedResult = {
                    userId, symbol, timeframe, initialBalance: mlResult.initial_balance,
                    finalBalance: mlResult.final_balance,
                    profit: mlResult.final_balance - mlResult.initial_balance,
                    totalTrades: mlResult.total_trades,
                    startDate: new Date(startDate).toISOString(), // Use original config dates
                    endDate: new Date(endDate).toISOString(),     // Use original config dates
                    candlesTested: mlResult.equity_curve?.length || 0, // Estimate from equity curve length
                    strategy: { // Define strategy object for consistency
                        name: `ML: ${mlModel || 'Default'}`, // Use model name from config if available
                        type: 'ml',
                        params: { ...globalParams, mlThreshold: mlThreshold }, // Include global and ML params
                        mlModel: mlModel || 'Default'
                    },
                    metrics: { // Map Python results to JS metrics structure
                        initialBalance: mlResult.initial_balance,
                        finalBalance: mlResult.final_balance,
                        totalProfit: mlResult.final_balance - mlResult.initial_balance,
                        totalReturn: mlResult.total_profit_pct,
                        totalTrades: mlResult.total_trades,
                        // Calculate wins/losses based on win_rate and total_trades
                        winningTrades: Math.round(mlResult.total_trades * (mlResult.win_rate / 100)),
                        losingTrades: Math.round(mlResult.total_trades * (1 - (mlResult.win_rate / 100))),
                        winRate: mlResult.win_rate,
                        // Note: Python script doesn't calculate avgWin/avgLoss directly in summary
                        // Need gross_profit / gross_loss from JSON or approximate
                        // Let's pull these from the detailed trade data if available
                        averageWin: 0, // Placeholder - Calculate below if possible
                        averageLoss: 0, // Placeholder - Calculate below if possible
                        profitFactor: mlResult.profit_factor === Infinity ? null : mlResult.profit_factor, // Handle Infinity
                        maxDrawdown: mlResult.max_drawdown_pct
                    },
                    // Convert equity curve timestamps (Python saves ISO strings)
                    equityCurve: mlResult.equity_curve.map(p => ({
                         timestamp: p.time, // Already a string from Python
                         balance: p.equity
                    })),
                     // Convert trade history timestamps and structure
                    tradeHistory: mlResult.trades.map(t => ({
                        // Map fields from Python's 'trades' structure to expected JS structure
                        action: t.action,
                        price: t.price,
                        time: t.time, // Already a string
                        size: t.size,
                        pnl_pct: t.pnl_pct,
                        profit: t.profit_usd || 0, // Use profit_usd as 'profit'
                        // These might be needed depending on frontend table structure
                        entryTime: t.action === 'buy' ? t.time : null, // Simplification - real entry time isn't in sell record
                        exitTime: t.action === 'sell' ? t.time : null, // Simplification
                        // exitReason: t.exitReason || 'ML Signal', // Add if available/needed
                        // entryPrice: t.entryPrice || null // Add if available/needed
                    })),
                };

                // Calculate Avg Win/Loss from detailed trades if available
                const finalTrades = formattedResult.tradeHistory.filter(t=> t.action === 'sell'); // Only look at closing trades
                const finalWinning = finalTrades.filter(t => t.profit > 0);
                const finalLosing = finalTrades.filter(t => t.profit <= 0);
                if (finalWinning.length > 0) {
                     formattedResult.metrics.averageWin = finalWinning.reduce((sum, t) => sum + t.profit, 0) / finalWinning.length;
                }
                 if (finalLosing.length > 0) {
                     formattedResult.metrics.averageLoss = Math.abs(finalLosing.reduce((sum, t) => sum + t.profit, 0)) / finalLosing.length;
                 }


                 // Decide whether to save or just return
                 if (!simulateOnly) {
                     console.log(`[Orchestrator] Saving fetched ML backtest result to database.`);
                     return await Backtest.create(formattedResult);
                 }
                 console.log(`[Orchestrator] Returning simulation-only fetched ML result.`);
                 return formattedResult;

            } catch (error) {
                console.error(`[Orchestrator] Failed to fetch or process pre-calculated ML results: ${error.message}`);
                if (error.response) { console.error("Response Status:", error.response.status, "Data:", error.response.data); }
                 else if (error.request) { console.error("No response received from internal API. Is the backend running on the correct port?"); }
                 else { console.error("Error during request setup:", error.message); }
                throw new Error(`Failed to retrieve ML backtest results. Ensure the results JSON exists and the endpoint '/api/ml/ml-backtest-results' is working correctly. Internal error: ${error.message}`);
            }

        } else if (mlMode === 'predictions') {
            // --- HYBRID MODE (Keep using Node.js simulation for now) ---
            console.log(`[Orchestrator] Running HYBRID backtest via Node.js simulation.`);
            if (!mlModel) throw new Error("ML Model name ('mlModel') is required for Hybrid mode.");

            // Fetch ML Config (might still be needed to get feature names)
            const mlConfig = await _getMLConfig(mlModel, authToken);
            dynamicFeatureNames = mlConfig.features;

            // Fetch Feature Data
            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);

            // Extract Candles from Feature Data
            candles = fullFeatureData.map(row => {
                const timestamp = new Date(row.datetime).getTime();
                // Ensure OHLC are numbers
                const open = Number(row.open);
                const high = Number(row.high);
                const low = Number(row.low);
                const close = Number(row.close);
                if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) return null;
                return [timestamp, open, high, low, close];
            }).filter(candle => candle !== null);

            if (!candles || candles.length < 2) throw new Error("Not enough valid candle data in feature file for Hybrid mode.");

            // Prepare Features for Bulk Prediction - Align with valid candles
             const validTimestamps = new Set(candles.map(c => c[0]));
             const alignedFeatureData = fullFeatureData.filter(row => {
                 const row_ms = new Date(row.datetime).getTime();
                 return !isNaN(row_ms) && validTimestamps.has(row_ms);
             });

             const features = alignedFeatureData.map(row =>
                 dynamicFeatureNames.map(feature => {
                     const val = row[feature];
                     return (typeof val !== 'number' || isNaN(val)) ? 0 : val; // Default missing features to 0
                 })
             );


            if (features.length !== candles.length) {
                 console.error(`Hybrid Feature/Candle Count Mismatch: Candles=${candles.length}, Features=${features.length}, AlignedRows=${alignedFeatureData.length}`);
                 // Attempt to align based on timestamp mapping if lengths differ significantly
                 throw new Error(`Hybrid Data alignment failed: Candles (${candles.length}), Features (${features.length}). Check data integrity and date ranges.`);
             }

            // Get Bulk Predictions
            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
            if (mlPredictions.length !== candles.length) throw new Error(`Hybrid Prediction count mismatch: Candles (${candles.length}), Predictions (${mlPredictions.length}).`);

            console.log(`[Orchestrator] Hybrid Prep: Fetched ${candles.length} candles/features & ${mlPredictions.length} predictions.`);
            // Continue to common simulation step below...

        } else {
             // --- PURE TA MODE --- (Keep As Is)
             console.log(`[Orchestrator] Pure TA mode detected. Fetching OHLCV data.`);
             const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
             if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for the selected period.");
             candles = data.candles;
             console.log(`[Orchestrator] Fetched ${candles.length} candles for Pure TA.`);
             // Continue to common simulation step below...
        }


        // --- STEP 2: Execute Simulation(s) (Only for TA and Hybrid) ---
        // This block is now skipped for mlMode === 'on'
        if (mlMode !== 'on') {
            if (isComboTest) {
                // --- COMBO MODE (TA or Hybrid) ---
                console.log(`[Orchestrator] Running COMBO backtest with ${config.strategies.length} strategies. Mode: ${mlMode}`);
                const individualResults = [];

                for (const stratConfig of config.strategies) {
                    const { code, params: stratParams } = stratConfig;
                    if (!code) throw new Error("Strategy 'code' is required for combo items.");
                    const strategy = await Strategy.findOne({ userId, code }).lean();
                    if (!strategy) throw new Error(`Strategy '${code}' not found.`);
                    if (!strategy.params?.strategyType) throw new Error(`Strategy '${code}' missing params.`);

                    const strategyFunction = getStrategy(strategy.params.strategyType);
                    if (!strategyFunction) throw new Error(`Function for type '${strategy.params.strategyType}' not found.`);

                    // Combine DB params, per-backtest strat params, AND global params
                    const combinedParams = { ...strategy.params, ...stratParams, ...globalParams };

                    console.log(`[Orchestrator] Running simulation for combo item: ${strategy.name}`);
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
                // Return combo result directly (doesn't save aggregate to DB by default)
                return comboResult;

            } else {
                // --- SINGLE MODE (TA or Hybrid) ---
                console.log(`[Orchestrator] Running SINGLE backtest. Mode: ${mlMode}`);
                const { code } = config;
                let strategyFunction = () => ({ signal: 'hold' }); // Default dummy for safety
                let strategyParams = { ...globalParams, ...(config.params || {}) }; // Start with global, add specific from config.params
                let strategyName = 'N/A', strategyType = 'N/A';

                // Only need strategy details if not Pure ML
                if (mlMode !== 'on') {
                    if (!code) throw new Error("Strategy 'code' required for TA/Hybrid mode.");
                    const strategy = await Strategy.findOne({ userId, code }).lean();
                    if (!strategy) throw new Error(`Strategy '${code}' not found.`);
                    if (!strategy.params?.strategyType) throw new Error(`Strategy '${code}' missing params.`);

                    strategyFunction = getStrategy(strategy.params.strategyType);
                    if (!strategyFunction) throw new Error(`Function for type '${strategy.params.strategyType}' not found.`);

                    // Order matters: Global < Config < DB Strategy Params
                    strategyParams = { ...globalParams, ...(config.params || {}), ...strategy.params };
                    strategyName = strategy.name;
                    strategyType = strategy.params.strategyType;
                } else {
                     // Should not happen if mlMode === 'on' is handled above, but set defaults
                     strategyName = `ML: ${mlModel || 'Default'}`;
                     strategyType = 'ml';
                }


                if (mlMode === 'predictions') { // Adjust name/type for Hybrid
                    strategyName = `Hybrid: ${strategyName || 'Unknown TA'} + ${mlModel || 'Unknown ML'}`;
                    strategyType = 'hybrid';
                }

                 console.log(`[Orchestrator] Running simulation for single strategy: ${strategyName}`);
                const { closedTrades, equityCurve } = runSimulation({
                    candles, strategyFunction, strategyParams, // Use the fully combined params
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
                    strategy: {
                         name: strategyName,
                         type: strategyType,
                         // Only save relevant params actually used by the strategy/simulation
                         params: strategyParams,
                         mlModel: mlMode !== 'off' ? mlModel : null
                    },
                    metrics,
                     equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })),
                     tradeHistory: closedTrades.map(t => ({ // Ensure trade history has necessary fields
                        action: t.signal === 'buy' ? 'LONG' : 'SHORT', // Or keep as buy/sell
                        entryPrice: t.entryPrice,
                        exitPrice: t.exitPrice,
                        entryTime: t.entryTime instanceof Date ? t.entryTime.toISOString() : t.entryTime,
                        exitTime: t.exitTime instanceof Date ? t.exitTime.toISOString() : t.exitTime,
                        profit: t.profit,
                        size: t.size,
                        exitReason: t.exitReason,
                        // Add ML info if available and needed
                        mlEntrySignal: t.mlEntrySignal,
                        mlEntryConfidence: t.mlEntryConfidence
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
        console.error(`[Orchestrator] Backtest failed with a critical error: ${error.message}`);
        console.error(error.stack); // Log full stack trace
        // Consider re-throwing a more specific error or returning an error object
        throw new Error(`Backtest Orchestration Failed: ${error.message}`);
    }
};
