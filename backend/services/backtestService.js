// File: services/backtestService.js
// UPGRADED to support Pure TA, Pure ML, and Hybrid (TA+ML) backtesting.

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";
import axios from "axios"; // --- ADD THIS ---
import { parse } from "csv-parse/sync"; // --- ADD THIS (Run: npm install csv-parse) ---

// --- ADD THIS: Define your ML Server and Feature Names ---
const ML_SERVER_URL = "https://74.208.28.77:8000";
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
            // WARNING: This ignores SSL certificate errors. Not for production.
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
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
            return row_dt >= start_dt && row_dt <= end_dt;
        });

        if (filteredData.length === 0) {
            throw new Error("No historical data found for the selected date range.");
        }
        return filteredData;

    } catch (error) {
        console.error(`[ML] Failed to download feature file: ${error.message}`);
        throw new Error(`Failed to download feature file from ${data_url}. Is the ML server running?`);
    }
};

/**
 * --- ADD THIS HELPER ---
 * Gets bulk ML predictions from the Python server.
 */
const _getBulkPredictions = async (modelName, features) => {
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`;
    console.log(`[ML] Getting bulk predictions for ${modelName}...`);
    
    try {
        const payload = {
            model_name: modelName,
            features: features
        };
        const response = await axios.post(bulk_url, payload, {
            // WARNING: This ignores SSL certificate errors.
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        return response.data.predictions; // Returns an array [0, 1, 0, 1, ...]

    } catch (error) {
        console.error(`[ML] Bulk prediction failed: ${error.response ? error.response.data.detail : error.message}`);
        throw new Error(`Bulk prediction failed: ${error.response ? error.response.data.detail : error.message}`);
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

        // 1. Check for Exits (This logic remains the same)
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
            // --- MODIFIED SIGNAL LOGIC ---
            let taSignal = 'hold';
            let mlSignal = 0; // Default ML signal is 0 (Sell/Hold)
            
            // A. Get TA Signal (if applicable)
            if (mlMode === 'off' || mlMode === 'predictions') {
                try {
                    taSignal = strategyFunction(historicalCandles, strategyParams).signal || 'hold';
                } catch (strategyError) {
                    console.error(`[Strategy Execution Crash at ${new Date(timestamp).toISOString()}]:`, strategyError.message);
                    continue; 
                }
            }

            // B. Get ML Signal (if applicable)
            if (mlMode === 'on' || mlMode === 'predictions') {
                mlSignal = mlPredictions[i]; // Get the pre-calculated signal
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
                // (Add sell logic if your TA strategy supports it)
                // else if (taSignal === 'sell' && mlSignal === 0) {
                //     finalSignal = 'sell';
                // }
            }
            // --- END OF MODIFIED LOGIC ---

            if (finalSignal === 'buy' || finalSignal === 'sell') {
                const { SL: slPercent, TP: tpPercent } = strategyParams;
                if (!slPercent || slPercent <= 0) continue;

                let effectiveRiskPercent = riskPercentage;
                if (isInGrowthMode) {
                    if (currentBalance >= growthCapitalTarget) {
                        isInGrowthMode = false;
                        effectiveRiskPercent = riskPercentage;
                    } else {
                        effectiveRiskPercent = 100; // "All in" for growth
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
                    signal: finalSignal,
                    slPrice: finalSignal === 'buy' ? close * (1 - stopLossDecimal) : close * (1 + stopLossDecimal),
                    tpPrice: finalSignal === 'buy' ? close * (1 + (tpPercent / 100)) : close * (1 - (tpPercent / 100)),
                };
            }
        }
    }
    
    const lastTimestamp = candles[candles.length - 1][0];
    if (equityCurve[equityCurve.length - 1].timestamp !== lastTimestamp) {
        equityCurve.push({ timestamp: lastTimestamp, balance: currentBalance });
    }

    return { closedTrades, equityCurve };
};


/**
 * Calculates a comprehensive set of performance metrics from trades.
 * (This function is unchanged)
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
 * --- HEAVILY MODIFIED ORCHESTRATOR ---
 * Orchestrates a backtest, now handling all 3 ML modes.
 */
export const runBacktest = async (config) => {
    const { 
        userId, code, symbol, timeframe, startDate, endDate, 
        simulateOnly = true, mlMode, mlModel, ...riskParams 
    } = config;

    let candles;
    let mlPredictions = null;
    let strategyFunction = () => ({ signal: 'hold' }); // Default empty strategy
    let strategyParams = { ...config.params };
    let strategyName, strategyType;

    // 1. Fetch Strategy (if TA or Hybrid)
    if (mlMode === 'off' || mlMode === 'predictions') {
        if (!code) throw new Error("Strategy 'code' is required for TA or Hybrid mode.");
        const strategy = await Strategy.findOne({ userId, code }).lean();
        if (!strategy) throw new Error("Strategy not found.");
        
        strategyFunction = getStrategy(strategy.params.strategyType);
        strategyParams = { ...strategy.params, ...config.params };
        strategyName = strategy.name;
        strategyType = strategy.params.strategyType;
    }

    // 2. Fetch Data & ML Predictions (if ML or Hybrid)
    if (mlMode === 'on' || mlMode === 'predictions') {
        // Use the new feature data downloader
        const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);
        
        // A. Extract candles from the feature data
        candles = fullFeatureData.map(row => [
            new Date(row.datetime).getTime(), // timestamp
            row.open, row.high, row.low, row.close
        ]);

        // B. Extract features for the model
        const features = fullFeatureData.map(row => 
            FEATURE_NAMES.map(feature => row[feature])
        );

        // C. Get bulk predictions from Python server
        mlPredictions = await _getBulkPredictions(mlModel, features);

        if (mlMode === 'on') {
            // Pure ML mode
            strategyName = `ML: ${mlModel}`;
            strategyType = 'ml';
        } else {
            // Hybrid mode
            strategyName = `Hybrid: ${strategyName} + ${mlModel}`;
            strategyType = 'hybrid';
        }

    } else {
        // Pure TA mode (old logic)
        const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
        if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for the selected period.");
        candles = data.candles;
    }

    // 3. Run the Simulation
    const initialBalance = config.initialBalance || strategyParams.initialBalance || 1000;
    
    const { closedTrades, equityCurve } = runSimulation({
        candles,
        strategyFunction,
        strategyParams,
        riskParams,
        initialBalance,
        mlMode, // Pass the mode to the simulator
        mlPredictions // Pass the predictions to the simulator
    });
    
    // 4. Calculate Final Metrics
    const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

    // 5. Prepare Result Object
    const backtestData = {
        userId,
        symbol,
        timeframe,
        initialBalance,
        finalBalance: metrics.finalBalance,
        profit: metrics.totalProfit,
        totalTrades: metrics.totalTrades,
        startDate,
        endDate,
        candlesTested: candles.length,
        strategy: {
            name: strategyName,
            type: strategyType,
            params: strategyParams,
            mlModel: mlModel // Store which model was used
        },
        metrics,
        equityCurve,
        tradeHistory: closedTrades,
    };

    // 6. Save to DB or Return
    if (!simulateOnly) {
        return await Backtest.create(backtestData);
    }
    return backtestData;
};
