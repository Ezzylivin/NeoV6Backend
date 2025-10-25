// File: services/backtestService.js
// UPGRADED: Full support for Pure TA, Pure ML, and Hybrid (TA+ML) backtesting.
// FIX: Uses streams for CSV parsing to prevent memory errors (OOM).
// FIX: Correctly forwards the JWT token to the Python ML server (401 fix).
// FIX: Corrected metrics calculation to prevent NaN database error (WinRate fix).
// FIX: Added explicit exit logic for Pure ML mode (1=Buy, 0=Hold, -1=Sell).

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

// Agent to ignore SSL errors for the self-signed certificate on the ML server
const httpsAgent = new https.Agent({ rejectUnauthorized: false });


/**
 * Downloads and parses the feature file using streams to save memory.
 */
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    const data_filename = `${symbol}-${timeframe}-features.csv`;
    const data_url = `${ML_SERVER_URL}/data/${data_filename}`;
    console.log(`[ML] Streaming feature data from: ${data_url}`);

    const start_dt = new Date(startDate);
    const end_dt = new Date(endDate);
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
            if (row_dt >= start_dt && row_dt <= end_dt) {
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
            throw new Error(`No historical data found for the selected date range (${startDate} to ${endDate}).`);
        }
        console.log(`[ML] Found ${filteredData.length} feature rows for the date range.`);
        return filteredData;

    } catch (error) {
        let errorMessage = `Failed to stream feature file from ${data_url}.`;
        if (error.response) {
            errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`;
        } else if (error.request) {
            errorMessage += ` No response from ML server. Is it running?`;
        } else {
            errorMessage += ` Error: ${error.message}`;
        }
        console.error(`[ML] Failed to stream feature file: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};

/**
 * Gets bulk ML predictions, accepting and using the Authorization header.
 */
const _getBulkPredictions = async (modelName, features, authToken) => {
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`;
    console.log(`[ML] Getting bulk predictions for ${modelName} (${features.length} samples})...`);

    try {
        const payload = { model_name: modelName, features: features };

        // --- FIX: Add Authorization Header ---
        const headers = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        } else {
            console.warn("[ML] WARNING: No auth token provided for bulk prediction call.");
        }
        // --- END FIX ---

        const response = await axios.post(bulk_url, payload, {
            httpsAgent: httpsAgent,
            headers: headers // Pass the headers with the token
        });
        console.log(`[ML] Received ${response.data.predictions.length} predictions.`);
        return response.data.predictions;

    } catch (error) {
        let errorMessage = `Bulk prediction failed for model ${modelName}.`;
        if (error.response) {
            errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`;
        } else if (error.request) { errorMessage += ` No response from ML server. Is it running?`; }
        else { errorMessage += ` Error: ${error.message}`; }
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
        strategyFunction,
        strategyParams,
        riskParams,
        initialBalance,
        mlMode,
        mlPredictions
    } = config;

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

    // Main Simulation Loop - Start from 1 to have history for indicators
    for (let i = 1; i < candles.length; i++) {
        const [timestamp, open, high, low, close] = candles[i];
        if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) {
            console.warn(`[Simulation] Skipping candle ${i} due to invalid data:`, candles[i]);
            continue;
        }
        const historicalCandles = candles.slice(0, i + 1);

        // --- 1. Check for Exits ---
        if (position) {
            let exitPrice = null;
            let exitReason = '';
            const { slPrice, tpPrice, signal } = position;

            // 🛑 FIX: Check for forced ML exit signal only if not already exiting via SL/TP
            if (mlMode === 'on' && mlPredictions && i < mlPredictions.length) {
                const mlSignal = mlPredictions[i];
                
                // Exit if ML signals sell (-1) when long, or buy (1) when short
                if (mlSignal === -1 && signal === 'buy') {
                    exitPrice = close;
                    exitReason = 'ML Exit Signal (Reverse)';
                    console.log(`[DEBUG: Exit] ML Reverse Exit (Buy -> Sell) at ${new Date(timestamp).toISOString()}, Price: ${exitPrice}`); // DEBUG
                } else if (mlSignal === 1 && signal === 'sell') {
                    exitPrice = close;
                    exitReason = 'ML Exit Signal (Reverse)';
                    console.log(`[DEBUG: Exit] ML Reverse Exit (Sell -> Buy) at ${new Date(timestamp).toISOString()}, Price: ${exitPrice}`); // DEBUG
                }
            }

            // Check SL/TP and overwrite if triggered
            if (exitPrice === null) {
                if (signal === 'buy') {
                    if (low <= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                    else if (high >= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
                } else if (signal === 'sell') {
                    if (high >= slPrice) { exitPrice = slPrice; exitReason = 'Stop-Loss'; }
                    else if (low <= tpPrice) { exitPrice = tpPrice; exitReason = 'Take-Profit'; }
                }
            }


            if (exitPrice !== null) {
                const pnl = (exitPrice - position.entryPrice) * position.size * (signal === 'buy' ? 1 : -1);
                currentBalance += pnl;

                position.exitTime = new Date(timestamp);
                position.exitPrice = exitPrice;
                position.profit = pnl;
                position.exitReason = exitReason;
                closedTrades.push({ ...position });
                equityCurve.push({ timestamp, balance: currentBalance });
                
                // DEBUG: Log a trade exit
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
            let mlSignal = 0;

            // A. Get TA Signal (if applicable)
            if (mlMode === 'off' || mlMode === 'predictions') {
                if (!strategyFunction) {
                    console.error("[Simulation] TA mode selected but strategyFunction is missing.");
                    continue;
                }
                try {
                    taSignal = strategyFunction(historicalCandles, strategyParams)?.signal || 'hold';
                } catch (strategyError) {
                    console.error(`[Simulation] Strategy Execution Crash at ${new Date(timestamp).toISOString()}:`, strategyError.message, strategyError.stack);
                    continue;
                }
            }

            // B. Get ML Signal (if applicable)
            if (mlMode === 'on' || mlMode === 'predictions') {
                if (!mlPredictions || i >= mlPredictions.length) {
                    // This warning might be too noisy if only a few at the end are missing, but good for initial debug.
                    // console.warn(`[Simulation] ML mode selected but prediction missing for candle index ${i}.`); 
                    continue;
                }
                mlSignal = mlPredictions[i];
            }

            // C. Determine Final Signal based on Mode
            let finalSignal = 'hold';
            if (mlMode === 'off') {
                finalSignal = taSignal;
            }
            else if (mlMode === 'on') {
                // 🛑 FIX: PURE ML: 1=Buy, -1=Sell, 0=Hold
                if (mlSignal === 1) {
                    finalSignal = 'buy';
                } else if (mlSignal === -1) {
                    finalSignal = 'sell';
                }
            }
            else if (mlMode === 'predictions') {
                // 🛑 FIX: Hybrid: Only trade if TA signal AND ML prediction agree (1/-1)
                if (taSignal === 'buy' && mlSignal === 1) {
                    finalSignal = 'buy';
                }
                else if (taSignal === 'sell' && mlSignal === -1) {
                    finalSignal = 'sell';
                }
            }
            
            // DEBUG: Log the final signal determination
            if (mlMode === 'predictions' || mlMode === 'on') {
                console.log(`[DEBUG: Signal] Time: ${new Date(timestamp).toISOString()}. Mode: ${mlMode}. TA: ${taSignal}. ML: ${mlSignal}. Final: ${finalSignal}`);
            }

            if (finalSignal === 'buy' || finalSignal === 'sell') {
                const { SL: slPercent = 1, TP: tpPercent = 2 } = strategyParams || {};
                if (slPercent <= 0) { continue; }

                let effectiveRiskPercent = riskPercentage;
                if (isInGrowthMode) {
                    if (currentBalance >= growthCapitalTarget) {
                        isInGrowthMode = false;
                        effectiveRiskPercent = riskPercentage;
                    } else {
                        effectiveRiskPercent = 100;
                        console.log(`[DEBUG: Risk] In Growth Mode. Risk set to 100%.`); // DEBUG
                    }
                }

                const riskDecimal = Math.max(0, Math.min(1, effectiveRiskPercent / 100));
                const stopLossDecimal = slPercent / 100;

                let positionSizeDollars = (currentBalance * riskDecimal) / stopLossDecimal;
                positionSizeDollars = Math.min(positionSizeDollars, currentBalance);
                const positionSizeUnits = close > 0 ? positionSizeDollars / close : 0;

                 if (positionSizeUnits > 0) {
                    const slPrice = finalSignal === 'buy' ? close * (1 - stopLossDecimal) : close * (1 + stopLossDecimal);
                    const tpPrice = finalSignal === 'buy' ? close * (1 + (tpPercent / 100)) : close * (1 - (tpPercent / 100));

                    position = {
                        entryPrice: close,
                        entryTime: new Date(timestamp),
                        size: positionSizeUnits,
                        signal: finalSignal,
                        slPrice: slPrice,
                        tpPrice: tpPrice,
                    };

                    // DEBUG: Log a trade entry
                    console.log(`[DEBUG: Trade Entry] ${finalSignal.toUpperCase()} signal at ${close.toFixed(2)}. Size: ${positionSizeUnits.toFixed(4)} units. SL: ${slPrice.toFixed(2)}, TP: ${tpPrice.toFixed(2)}`);
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
    // (Unchanged logic for calculating metrics: totalReturn, winRate, drawdown, etc.)
    
    if (!equityCurve || equityCurve.length === 0) {
        console.warn("[Metrics] Equity curve is empty. Returning zeroed metrics."); // DEBUG
        return { initialBalance, finalBalance: initialBalance, totalProfit: 0, totalReturn: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: 0, maxDrawdown: 0 };
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
    const maxDrawdownPercent = peakBalance > 0 ? (maxDrawdownValue / peakBalance) * 100 : 0;

    // 🛑 FIX APPLIED HERE: Prevent NaN error when totalTrades is 0
    const totalTrades = trades.length;

    const metrics = {
        initialBalance, finalBalance, totalProfit,
        totalReturn: (totalProfit / initialBalance) * 100,
        totalTrades: totalTrades,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        // FIX: Ensure winRate is 0 if totalTrades is 0
        winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0, 
        averageWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
        averageLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity,
        maxDrawdown: maxDrawdownPercent,
    };
    
    console.log(`[Metrics] Total Trades: ${metrics.totalTrades}, Win Rate: ${metrics.winRate.toFixed(2)}%, Final Balance: $${metrics.finalBalance.toFixed(2)}`); // DEBUG
    return metrics;
};

/**
 * --- HEAVILY MODIFIED ORCHESTRATOR ---
 * Orchestrates a backtest, now handling all 3 ML modes and authentication.
 */
export const runBacktest = async (config, authToken) => { // ACCEPTS authToken
    console.log("[runBacktest] Starting orchestrator with config:", config);
    const {
        userId, code, symbol, timeframe, startDate, endDate,
        simulateOnly = true, mlMode = 'off', mlModel, ...riskParams
    } = config;

    let candles;
    let mlPredictions = null;
    let strategyFunction = null;
    let strategyParams = { ...(config.params || {}) };
    let strategyName = 'N/A', strategyType = 'N/A';

    try {
        // --- STEP 1: Fetch Strategy (if TA or Hybrid) ---
        if (mlMode === 'off' || mlMode === 'predictions') {
            if (!code) throw new Error("Strategy 'code' is required for TA or Hybrid mode.");
            const strategy = await Strategy.findOne({ userId, code }).lean();
            if (!strategy) throw new Error(`Strategy with code '${code}' not found.`);

            if (!strategy.params || !strategy.params.strategyType) {
                 throw new Error(`Strategy '${code}' is missing required parameters (strategyType).`);
            }

            strategyFunction = getStrategy(strategy.params.strategyType);
            if (!strategyFunction) {
                 throw new Error(`Could not load strategy function for type: ${strategy.params.strategyType}`);
            }
            strategyParams = { ...strategy.params, ...(config.params || {}) };
            strategyName = strategy.name;
            strategyType = strategy.params.strategyType;
            console.log(`[Orchestrator] TA Strategy loaded: ${strategyName} (Type: ${strategyType})`); // DEBUG
        }

        // --- STEP 2: Fetch Data & ML Predictions (if ML or Hybrid) ---
        if (mlMode === 'on' || mlMode === 'predictions') {
            if (!mlModel) throw new Error("ML Model name ('mlModel') is required for ML or Hybrid mode.");
            console.log(`[Orchestrator] ML/Hybrid mode detected. Model: ${mlModel}.`); // DEBUG

            // Use the new feature data downloader (Memory Safe)
            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);

            // A. Extract candles (required format: [[timestamp, open, high, low, close], ...])
            candles = fullFeatureData.map(row => {
                 const timestamp = new Date(row.datetime).getTime();
                 const { open, high, low, close } = row;
                 if ([timestamp, open, high, low, close].some(v => typeof v !== 'number' || isNaN(v))) return null;
                 return [timestamp, open, high, low, close];
            }).filter(candle => candle !== null);

            if (!candles || candles.length < 2) {
                 throw new Error("Not enough valid market data found in feature file for the selected period.");
            }

            // B. Extract features for the model (array of arrays, shape [N, 43])
            const features = fullFeatureData
                .filter(row => !isNaN(new Date(row.datetime).getTime()))
                .map(row => FEATURE_NAMES.map(feature => {
                    const val = row[feature];
                    return (typeof val !== 'number' || isNaN(val)) ? 0 : val;
                }));

            if (features.length !== candles.length) {
                 throw new Error(`Mismatch between candle count (${candles.length}) and feature set count (${features.length}).`);
            }

            // C. Get bulk predictions from Python server (FIXED: authToken passed here)
            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);

            if (mlPredictions.length !== candles.length) {
                 throw new Error(`Mismatch between candle count (${candles.length}) and prediction count (${mlPredictions.length}).`);
            }
            
            console.log(`[Orchestrator] Successfully fetched ${candles.length} candles and ${mlPredictions.length} predictions.`); // DEBUG

            if (mlMode === 'on') {
                strategyName = `ML: ${mlModel}`;
                strategyType = 'ml';
                strategyFunction = () => ({ signal: 'hold' });
            } else {
                strategyName = `Hybrid: ${strategyName} + ${mlModel}`;
                strategyType = 'hybrid';
            }

        } else {
            // Pure TA mode
            console.log(`[Orchestrator] Pure TA mode detected. Fetching OHLCV data.`); // DEBUG
            const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
            if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for the selected period.");
            candles = data.candles;
            console.log(`[Orchestrator] Successfully fetched ${candles.length} candles for Pure TA.`); // DEBUG
        }
        
        // Final configuration log before simulation
        const initialBalance = config.initialBalance || strategyParams.initialBalance || 1000;
        console.log(`[Orchestrator] Final Config: Mode: ${mlMode}, Strategy: ${strategyName}, Initial Balance: $${initialBalance}`); // DEBUG

        // --- STEP 3: Run the Simulation ---
        const { closedTrades, equityCurve } = runSimulation({
            candles,
            strategyFunction,
            strategyParams,
            riskParams,
            initialBalance,
            mlMode,
            mlPredictions
        });

        // --- STEP 4: Calculate Final Metrics ---
        const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

        // --- STEP 5: Prepare Result Object ---
        const backtestData = {
            userId, symbol, timeframe, initialBalance,
            finalBalance: metrics.finalBalance, profit: metrics.totalProfit, totalTrades: metrics.totalTrades,
            startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(),
            candlesTested: candles.length,
            strategy: { name: strategyName, type: strategyType, params: strategyParams, mlModel: mlModel },
            metrics,
            equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })),
            tradeHistory: closedTrades.map(t => ({ ...t, entryTime: t.entryTime instanceof Date ? t.entryTime.toISOString() : t.entryTime, exitTime: t.exitTime instanceof Date ? t.exitTime.toISOString() : t.exitTime })),
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
        throw error;
    }
};
