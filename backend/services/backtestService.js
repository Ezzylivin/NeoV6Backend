// File: services/backtestService.js
// UPGRADED to support Pure TA, Pure ML, and Hybrid (TA+ML) backtesting.

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";
import axios from "axios"; // --- ADD THIS ---
import { parse } from "csv-parse/sync"; // --- ADD THIS ---
import https from 'https'; // --- ADD THIS --- For disabling SSL checks (dev only)

// --- ADD THIS: Define your ML Server and Feature Names ---
const ML_SERVER_URL = "https://74.208.28.77:8000";
// Ensure this list exactly matches the feature names your Python model expects
const FEATURE_NAMES = [
    'RSI_14', 'MACD_12_26_9', 'MACDh_12_26_9', 'MACDs_12_26_9',
    'STOCHk_14_3_3', 'STOCHd_14_3_3', 'STOCHh_14_3_3', 'CCI_20_0.015',
    'BBL_20_2.0_2.0', 'BBM_20_2.0_2.0', 'BBU_20_2.0_2.0', 'BBB_20_2.0_2.0',
    'BBP_20_2.0_2.0', 'ATRr_14', 'SMA_50', 'SMA_200', 'PSARl_0.02_0.2',
    'PSARs_0.02_0.2', 'PSARaf_0.02_0.2', 'PSARr_0.02_0.2', 'ISA_9',
    'ISB_26', 'ITS_9', 'IKS_26', 'ICS_26', 'OBV', 'BBL_5_2.0_2.0',
    'BBM_5_2.0_2.0', 'BBU_5_2.0_2.0', 'BBB_5_2.0_2.0', 'BBP_5_2.0_2.0',
    'sma_crossover', 'atr_signal', 'bb_signal', 'cci_signal',
    'ichimoku_signal', 'macd_signal', 'obv_signal', 'psar_signal',
    'rsi_signal', 'sma_crossover_signal', 'stoch_signal', 'momentum_strength'
];
// --------------------------------------------------------

// --- ADD THIS AGENT (For Development Only - Ignores SSL Errors) ---
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
// --------------------------------------------------------------------


/**
 * --- ADD THIS HELPER ---
 * Downloads the full feature file from your ML server.
 */
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    const data_filename = `${symbol}-${timeframe}-features.csv`;
    const data_url = `${ML_SERVER_URL}/data/${data_filename}`;
    console.log(`[ML] Downloading feature data from: ${data_url}`);

    try {
        const response = await axios.get(data_url, {
            // WARNING: Using this agent ignores SSL certificate errors.
            // Remove this in production if your ML server has a valid certificate.
            httpsAgent: httpsAgent
        });

        // Parse the CSV text into objects
        const records = parse(response.data, {
            columns: true,
            skip_empty_lines: true,
            cast: true // Auto-cast numbers
        });

        // Filter by date
        const start_dt = new Date(startDate);
        const end_dt = new Date(endDate);

        const filteredData = records.filter(row => {
            const row_dt = new Date(row.datetime);
            // Ensure valid date comparison
            if (isNaN(row_dt.getTime())) {
                console.warn(`[ML] Skipping row with invalid date: ${row.datetime}`);
                return false;
            }
            return row_dt >= start_dt && row_dt <= end_dt;
        });

        if (filteredData.length === 0) {
            throw new Error(`No historical data found for the selected date range (${startDate} to ${endDate}).`);
        }
        console.log(`[ML] Found ${filteredData.length} feature rows for the date range.`);
        return filteredData;

    } catch (error) {
        let errorMessage = `Failed to download feature file from ${data_url}.`;
        if (error.response) { // Error from server (e.g., 404)
            errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`;
        } else if (error.request) { // No response received
            errorMessage += ` No response from ML server. Is it running?`;
        } else { // Other errors (parsing, etc.)
            errorMessage += ` Error: ${error.message}`;
        }
        console.error(`[ML] Failed to download feature file: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};

/**
 * --- ADD THIS HELPER ---
 * Gets bulk ML predictions from the Python server.
 */
const _getBulkPredictions = async (modelName, features) => {
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`;
    console.log(`[ML] Getting bulk predictions for ${modelName} (${features.length} samples)...`);

    try {
        const payload = {
            model_name: modelName,
            features: features // This is already the array of arrays
        };
        const response = await axios.post(bulk_url, payload, {
            // WARNING: Using this agent ignores SSL certificate errors.
            httpsAgent: httpsAgent
        });
        console.log(`[ML] Received ${response.data.predictions.length} predictions.`);
        return response.data.predictions; // Returns an array [0, 1, 0, 1, ...]

    } catch (error) {
        let errorMessage = `Bulk prediction failed for model ${modelName}.`;
         if (error.response) { // Error from server (e.g., 404, 500)
            errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`;
        } else if (error.request) { // No response received
            errorMessage += ` No response from ML server. Is it running?`;
        } else { // Other errors
            errorMessage += ` Error: ${error.message}`;
        }
        console.error(`[ML] Bulk prediction failed: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


/**
 * --- MODIFIED SIMULATION ENGINE ---
 * Now accepts mlMode and mlPredictions to run all 3 backtest types.
 */
const runSimulation = (config) => {
    const {
        candles,
        strategyFunction, // TA strategy (e.g., MA Crossover)
        strategyParams,
        riskParams,
        initialBalance,
        mlMode, // 'off', 'on', 'predictions'
        mlPredictions // Array of [0, 1, 0, ...] or null
    } = config;

    console.log(`[Simulation] Starting simulation. Mode: ${mlMode}. Candles: ${candles.length}. Predictions: ${mlPredictions?.length || 0}`);

    let currentBalance = initialBalance;
    let position = null;
    const closedTrades = [];
    // Ensure the first candle timestamp is valid
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

    // Main Simulation Loop - Start from 1 to have history for indicators
    for (let i = 1; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
         // Basic validation for candle data
        if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) {
            console.warn(`[Simulation] Skipping candle ${i} due to invalid data:`, candles[i]);
            continue;
        }
        const historicalCandles = candles.slice(0, i + 1);

        // 1. Check for Exits (This logic remains the same)
        if (position) {
            let exitPrice = null;
            let exitReason = '';
            const { slPrice, tpPrice, signal } = position;

            // Simplified exit logic for clarity
            if (signal === 'buy') {
                if (low <= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                else if (high >= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
            } else if (signal === 'sell') { // Added explicit check for 'sell'
                if (high >= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                else if (low <= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
            }

            if (exitPrice !== null) { // Check against null
                const pnl = (exitPrice - position.entryPrice) * position.size * (signal === 'buy' ? 1 : -1);
                currentBalance += pnl;

                position.exitTime = new Date(timestamp);
                position.exitPrice = exitPrice;
                position.profit = pnl;
                position.exitReason = exitReason;
                closedTrades.push({ ...position });
                equityCurve.push({ timestamp, balance: currentBalance });
                position = null; // Reset position AFTER recording the trade

                if (currentBalance <= 0) {
                    console.warn('[Simulation] Account wiped out. Ending simulation.');
                    break; // Stop simulation if balance is zero or negative
                }
            }
        }

        // 2. Check for Entries
        if (!position) { // Only check for entry if not already in a position
            // --- MODIFIED SIGNAL LOGIC ---
            let taSignal = 'hold';
            let mlSignal = 0; // Default ML signal is 0 (Sell/Hold)

            // A. Get TA Signal (if applicable)
            if (mlMode === 'off' || mlMode === 'predictions') {
                if (!strategyFunction) {
                    console.error("[Simulation] TA mode selected but strategyFunction is missing.");
                    continue; // Skip candle if strategy is missing
                }
                try {
                    const taResult = strategyFunction(historicalCandles, strategyParams);
                    taSignal = taResult?.signal || 'hold';
                } catch (strategyError) {
                    console.error(`[Simulation] Strategy Execution Crash at ${new Date(timestamp).toISOString()}:`, strategyError.message, strategyError.stack);
                    continue;
                }
            }

            // B. Get ML Signal (if applicable)
            if (mlMode === 'on' || mlMode === 'predictions') {
                if (!mlPredictions || i >= mlPredictions.length) {
                    console.warn(`[Simulation] ML mode selected but prediction missing for candle index ${i}.`);
                    continue; // Skip candle if prediction is missing
                }
                mlSignal = mlPredictions[i]; // Get the pre-calculated signal for the CURRENT candle index
            }

            // C. Determine Final Signal based on Mode
            let finalSignal = 'hold';
            if (mlMode === 'off') {
                // PURE TA
                finalSignal = taSignal;
            }
            else if (mlMode === 'on') {
                // PURE ML
                finalSignal = (mlSignal === 1) ? 'buy' : 'hold'; // Assuming 1=Buy, 0=Hold/Sell
            }
            else if (mlMode === 'predictions') {
                // HYBRID (TA + ML Filter)
                if (taSignal === 'buy' && mlSignal === 1) {
                    finalSignal = 'buy';
                }
                 // Add explicit sell logic if your TA strategy supports it
                 else if (taSignal === 'sell' && mlSignal === 0) {
                     finalSignal = 'sell';
                 }
            }
            // --- END OF MODIFIED LOGIC ---

            if (finalSignal === 'buy' || finalSignal === 'sell') {
                // Ensure strategyParams are available and contain SL/TP
                const { SL: slPercent = 1, TP: tpPercent = 2 } = strategyParams || {}; // Default SL/TP
                if (slPercent <= 0) {
                     console.warn(`[Simulation] Invalid SL ${slPercent} at ${new Date(timestamp).toISOString()}, skipping entry.`);
                     continue; // Skip if SL is invalid
                }

                let effectiveRiskPercent = riskPercentage;
                if (isInGrowthMode) {
                    if (currentBalance >= growthCapitalTarget) {
                        isInGrowthMode = false;
                        effectiveRiskPercent = riskPercentage;
                    } else {
                        effectiveRiskPercent = 100; // "All in" for growth
                    }
                }

                const riskDecimal = Math.max(0, Math.min(1, effectiveRiskPercent / 100)); // Ensure risk is between 0 and 1
                const stopLossDecimal = slPercent / 100;

                // Position sizing calculation
                let positionSizeDollars = (currentBalance * riskDecimal) / stopLossDecimal;
                positionSizeDollars = Math.min(positionSizeDollars, currentBalance); // Cannot risk more than balance
                const positionSizeUnits = close > 0 ? positionSizeDollars / close : 0; // Avoid division by zero

                 if (positionSizeUnits > 0) {
                    position = {
                        entryPrice: close,
                        entryTime: new Date(timestamp),
                        size: positionSizeUnits,
                        signal: finalSignal,
                        slPrice: finalSignal === 'buy' ? close * (1 - stopLossDecimal) : close * (1 + stopLossDecimal),
                        tpPrice: finalSignal === 'buy' ? close * (1 + (tpPercent / 100)) : close * (1 - (tpPercent / 100)),
                    };
                 } else {
                      console.warn(`[Simulation] Calculated position size is zero or negative at ${new Date(timestamp).toISOString()}, skipping entry.`);
                 }
            }
        }
    } // End of main simulation loop

    // Add final equity point if the last recorded point is not the last candle
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
 * (Unchanged, but added some console logs)
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
     console.log(`[Metrics] Calculating metrics. Trades: ${trades.length}. Initial Balance: ${initialBalance}`);
    if (!equityCurve || equityCurve.length === 0) {
        console.error("[Metrics] Equity curve is empty or missing.");
        // Return default zero metrics if equity curve is invalid
         return {
            initialBalance, finalBalance: initialBalance, totalProfit: 0, totalReturn: 0,
            totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
            averageWin: 0, averageLoss: 0, profitFactor: 0, maxDrawdown: 0,
        };
    }

    if (trades.length === 0) {
         console.log("[Metrics] No trades executed.");
        return {
            initialBalance, finalBalance: initialBalance, totalProfit: 0, totalReturn: 0,
            totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
            averageWin: 0, averageLoss: 0, profitFactor: 0, maxDrawdown: 0,
        };
    }

    const finalBalance = equityCurve[equityCurve.length - 1].balance;
    const totalProfit = finalBalance - initialBalance;
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0); // Include trades with zero profit as losing

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));

    // Calculate Max Drawdown
    let peakBalance = initialBalance;
    let maxDrawdownValue = 0;
    equityCurve.forEach(point => {
        if (point.balance > peakBalance) peakBalance = point.balance;
        const drawdown = peakBalance - point.balance;
        if (drawdown > maxDrawdownValue) maxDrawdownValue = drawdown;
    });
    const maxDrawdownPercent = peakBalance > 0 ? (maxDrawdownValue / peakBalance) * 100 : 0;

    const metricsResult = {
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
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity, // Avoid division by zero
        maxDrawdown: maxDrawdownPercent,
    };
    console.log("[Metrics] Calculation complete:", metricsResult);
    return metricsResult;
};

/**
 * --- HEAVILY MODIFIED ORCHESTRATOR ---
 * Orchestrates a backtest, now handling all 3 ML modes.
 */
export const runBacktest = async (config) => {
    console.log("[runBacktest] Starting orchestrator with config:", config);
    const {
        userId, code, symbol, timeframe, startDate, endDate,
        simulateOnly = true, mlMode = 'off', mlModel, ...riskParams
    } = config;

    let candles;
    let mlPredictions = null;
    let strategyFunction = null; // Initialize as null
    let strategyParams = { ...(config.params || {}) }; // Ensure params object exists
    let strategyName = 'N/A', strategyType = 'N/A';

    try {
        // --- STEP 1: Fetch Strategy (if TA or Hybrid) ---
        if (mlMode === 'off' || mlMode === 'predictions') {
            if (!code) throw new Error("Strategy 'code' is required for TA or Hybrid mode.");
            console.log(`[runBacktest] Fetching strategy: ${code} for user: ${userId}`);
            const strategy = await Strategy.findOne({ userId, code }).lean();
            if (!strategy) throw new Error(`Strategy with code '${code}' not found.`);
            
            // Ensure strategy.params exists and has strategyType
             if (!strategy.params || !strategy.params.strategyType) {
                 throw new Error(`Strategy '${code}' is missing required parameters (strategyType).`);
             }

            strategyFunction = getStrategy(strategy.params.strategyType);
             if (!strategyFunction) {
                 throw new Error(`Could not load strategy function for type: ${strategy.params.strategyType}`);
             }
            strategyParams = { ...strategy.params, ...(config.params || {}) }; // Merge DB params with request params
            strategyName = strategy.name;
            strategyType = strategy.params.strategyType;
             console.log(`[runBacktest] TA Strategy '${strategyName}' loaded.`);
        }

        // --- STEP 2: Fetch Data & ML Predictions (if ML or Hybrid) ---
        if (mlMode === 'on' || mlMode === 'predictions') {
            console.log(`[runBacktest] ML Mode detected: ${mlMode}. Model: ${mlModel}`);
            if (!mlModel) throw new Error("ML Model name ('mlModel') is required for ML or Hybrid mode.");

            // Use the new feature data downloader
            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);

            // A. Extract candles (ensure format matches runSimulation expectations)
            candles = fullFeatureData.map(row => {
                 // Validate candle data during mapping
                 const timestamp = new Date(row.datetime).getTime();
                 const { open, high, low, close } = row;
                 if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) {
                      console.warn(`[runBacktest] Invalid candle data in feature row:`, row);
                      return null; // Mark as invalid
                 }
                 return [timestamp, open, high, low, close];
            }).filter(candle => candle !== null); // Remove invalid candles

            if (!candles || candles.length < 2) {
                 throw new Error("Not enough valid market data found in feature file for the selected period.");
            }
             console.log(`[runBacktest] Extracted ${candles.length} candles from feature data.`);


            // B. Extract features for the model
             const features = fullFeatureData
                // Filter out rows corresponding to null candles (if any)
                .filter(row => !isNaN(new Date(row.datetime).getTime()))
                .map(row =>
                    FEATURE_NAMES.map(feature => {
                        const val = row[feature];
                        // Basic check for valid numbers
                        if (typeof val !== 'number' || isNaN(val)) {
                            console.warn(`[runBacktest] Invalid feature '${feature}' in row:`, row);
                            return 0; // Or handle as needed (e.g., throw error, use null)
                        }
                        return val;
                    })
                );


             if (features.length !== candles.length) {
                  throw new Error(`Mismatch between candle count (${candles.length}) and feature set count (${features.length}). Check feature data integrity.`);
             }
             console.log(`[runBacktest] Extracted features for ${features.length} candles.`);


            // C. Get bulk predictions from Python server
            mlPredictions = await _getBulkPredictions(mlModel, features);

             if (mlPredictions.length !== candles.length) {
                  throw new Error(`Mismatch between candle count (${candles.length}) and prediction count (${mlPredictions.length}). Check bulk prediction endpoint.`);
             }
             console.log(`[runBacktest] Received ${mlPredictions.length} ML predictions.`);


            if (mlMode === 'on') {
                // Pure ML mode
                strategyName = `ML: ${mlModel}`;
                strategyType = 'ml';
                // Reset TA strategy function if Pure ML
                strategyFunction = () => ({ signal: 'hold' });
            } else {
                // Hybrid mode
                strategyName = `Hybrid: ${strategyName} + ${mlModel}`;
                strategyType = 'hybrid';
            }

        } else {
            // Pure TA mode (old logic)
             console.log("[runBacktest] Pure TA Mode detected.");
            const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
            if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for the selected period.");
            candles = data.candles;
             console.log(`[runBacktest] Fetched ${candles.length} candles for TA backtest.`);
        }

        // --- STEP 3: Run the Simulation ---
        const initialBalance = config.initialBalance || strategyParams.initialBalance || 1000;
        console.log(`[runBacktest] Running simulation with initial balance: ${initialBalance}`);

        const { closedTrades, equityCurve } = runSimulation({
            candles,
            strategyFunction,
            strategyParams,
            riskParams,
            initialBalance,
            mlMode, // Pass the mode to the simulator
            mlPredictions // Pass the predictions to the simulator
        });

        // --- STEP 4: Calculate Final Metrics ---
        const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

        // --- STEP 5: Prepare Result Object ---
        const backtestData = {
            userId,
            symbol,
            timeframe,
            initialBalance,
            finalBalance: metrics.finalBalance,
            profit: metrics.totalProfit,
            totalTrades: metrics.totalTrades,
            startDate: new Date(startDate).toISOString(), // Ensure ISO format
            endDate: new Date(endDate).toISOString(),     // Ensure ISO format
            candlesTested: candles.length,
            strategy: {
                name: strategyName,
                type: strategyType,
                params: strategyParams,
                mlModel: mlModel // Store which model was used
            },
            metrics,
            equityCurve: equityCurve.map(p => ({ // Ensure ISO format for equity curve
                 timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp,
                 balance: p.balance
            })),
            tradeHistory: closedTrades.map(t => ({ // Ensure ISO format for trades
                ...t,
                entryTime: t.entryTime instanceof Date ? t.entryTime.toISOString() : t.entryTime,
                exitTime: t.exitTime instanceof Date ? t.exitTime.toISOString() : t.exitTime,
            })),
        };

        // --- STEP 6: Save to DB or Return ---
        if (!simulateOnly) {
             console.log("[runBacktest] Saving backtest result to database...");
            const savedBacktest = await Backtest.create(backtestData);
             console.log(`[runBacktest] Backtest saved with ID: ${savedBacktest._id}`);
            return savedBacktest;
        } else {
             console.log("[runBacktest] Simulation only, returning results without saving.");
            return backtestData;
        }
    } catch (error) {
         console.error(`[runBacktest] Orchestration failed: ${error.message}`, error.stack);
         // Re-throw the error so the controller can handle it
         throw error;
    }
};
