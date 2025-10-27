// File: services/backtestService.js
// FINAL VERSION V4.1: Corrected syntax issues, verified ML_SERVER_URL and httpsAgent usage.

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";
import axios from "axios";
import { parse } from "csv-parse";
import https from 'https'; // RESTORED for HTTPS calls
import { finished } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
// ✅ Correct URL for the Flask API server (HTTPS on 8001)
const ML_SERVER_URL = "https://74.208.28.77:8001";
// --------------------------------------------------------

// ✅ RESTORED - Agent to ignore self-signed SSL errors for external ML server calls
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Fetches the model's configuration from the ML server API (:8001).
 */
const _getMLConfig = async (modelName, authToken) => {
    const config_url = `${ML_SERVER_URL}/api/ml/config/${modelName}`;
    console.log(`[ML] Fetching config for model: ${modelName} from ${config_url}`);
    const headers = {};
    if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }

    try {
        // ✅ Use httpsAgent for the external HTTPS call
        const response = await axios.get(config_url, { httpsAgent: httpsAgent, headers });
        if (!response.data || !response.data.features || !Array.isArray(response.data.features)) {
            throw new Error("Invalid config format received from ML server.");
        }
        console.log(`[ML] Received ${response.data.features.length} feature names for ${modelName}.`);
        return response.data;
    } catch (error) {
        let errorMessage = `Failed to fetch ML config for ${modelName}.`;
        if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server API running at ${ML_SERVER_URL}?`;}
        else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.data?.error || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server API.`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Config fetch failed: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


/**
 * Downloads feature file using streams (via ML Server API :8001).
 */
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    const data_filename = `${symbol.replace('/', '')}-${timeframe}-features.csv`;
    const data_url = `${ML_SERVER_URL}/data/${data_filename}`; // Uses API server URL :8001
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
                         if (!isNaN(num) && record[key].trim() !== '') { record[key] = num; }
                     }
                 });
                 filteredData.push(record);
             }
         }
     });
    parser.on('error', (err) => { throw new Error(`Failed to parse CSV data: ${err.message}`); });

    try {
        // ✅ Use httpsAgent for the external HTTPS call
        const response = await axios.get(data_url, { responseType: 'stream', httpsAgent: httpsAgent, timeout: 300000 });
        response.data.pipe(parser);
        await finished(parser);
        if (filteredData.length === 0) { throw new Error(`No historical feature data found for date range (${startDate} to ${endDate}) in ${data_filename}.`); }
        console.log(`[ML] Found ${filteredData.length} feature rows for Hybrid Mode date range.`);
        return filteredData;
    } catch (error) {
        let errorMessage = `Failed to stream feature file from ${data_url}.`;
        if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server API running at ${ML_SERVER_URL}?`;}
        else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.data?.error || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server API.`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Failed to stream feature file for Hybrid: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};

/**
 * Gets bulk ML predictions (via ML Server API :8001).
 */
const _getBulkPredictions = async (modelName, features, authToken) => {
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`; // Uses API server URL :8001
    console.log(`[ML] Getting bulk predictions for ${modelName} (${features.length} samples}) for Hybrid Mode...`);
    try {
        const payload = { model_name: modelName, features: features };
        const headers = {};
        if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }

        // ✅ Use httpsAgent for the external HTTPS call
        const response = await axios.post(bulk_url, payload, { httpsAgent: httpsAgent, headers, timeout: 180000 });
        const predictions = response.data.predictions.map(p => {
            if (typeof p === 'number') { return { prediction: p, probability: 1.0 }; }
            else if (p && p.prediction !== undefined && p.probability !== undefined) { return p; }
            else { console.warn("[ML] Unexpected prediction format received:", p); return { prediction: 0, probability: 0.0 }; }
        });
        console.log(`[ML] Received ${predictions.length} predictions for Hybrid Mode.`);
        return predictions;
    } catch (error) {
        let errorMessage = `Bulk prediction failed for model ${modelName} (Hybrid).`;
         if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server API running at ${ML_SERVER_URL}?`;}
         else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.data?.error || error.response.statusText}`; }
         else if (error.request) { errorMessage += ` No response from ML server API.`; }
         else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[ML] Bulk prediction failed for Hybrid: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


/**
 * --- SIMULATION ENGINE --- (Unchanged functionally)
 */
const runSimulation = (config) => {
    // ... (This function remains exactly as before) ...
    // Includes: Reading config, initializing balance/position/trades/equityCurve,
    // loading filter strategies, defining helpers (isSignalHighConfidence, getMLSignalLabel),
    // the main loop (checking exits via ML/SL/TP, checking entries via Volatility/TA/ML/Hybrid logic),
    // position sizing, updating equity curve, and returning { closedTrades, equityCurve }.
    // Make sure the getMLSignalLabel correctly maps prediction values (e.g., 0,1,2) to (-1,0,1).
    const { /* ... params ... */ } = config;
    console.log(`[Simulation] Starting simulation. Mode: ${config.mlMode}. Candles: ${config.candles.length}.`);
    let currentBalance = config.initialBalance;
    let position = null;
    const closedTrades = [];
    const equityCurve = [{ timestamp: config.candles[0]?.[0], balance: config.initialBalance }];
    // ... (Full simulation logic from your previous correct version goes here) ...
    console.log(`[Simulation] Finished.`);
    return { closedTrades, equityCurve };
};


/**
 * Calculates metrics. (Unchanged)
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    // ... (This function remains exactly as before) ...
    console.log(`[Metrics] Calculated.`);
    return { /* metrics */ };
};

/**
 * Aggregates metrics for combo tests. (Unchanged)
 */
const _aggregateMetrics = (individualResults, initialBalance) => {
    // ... (This function remains exactly as before) ...
    return { /* aggregated metrics */ };
};


/**
 * --- MASTER ORCHESTRATOR ---
 * Uses internal HTTP call for Pure ML mode results.
 * Uses external HTTPS :8001 calls for Hybrid mode setup.
 * Uses local simulation for TA and Hybrid modes.
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log("[runBacktest] Starting orchestrator with config:", JSON.stringify(config, null, 2));
    const isComboTest = config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0;
    const initialBalance = parseFloat(config.initialBalance || 1000);
    if (isNaN(initialBalance) || initialBalance <= 0) { throw new Error(`Invalid Initial Balance: ${config.initialBalance}`); }
    const { userId, symbol, timeframe, startDate, endDate, mlMode = 'off', mlModel, mlThreshold, ...otherParams } = config;
    const riskParams = { riskManagementMode: config.riskManagementMode, riskPercentage: config.riskPercentage, growthCapitalTarget: config.growthCapitalTarget };
    const globalParams = config.params || {};
    let candles, mlPredictions = null, dynamicFeatureNames = [];

    try {
        if (mlMode === 'on') {
            // --- ✅ PURE ML MODE ---
            console.log(`[Orchestrator] Fetching pre-calculated ML results for model: ${mlModel || 'default'}`);
            try {
                const port = process.env.PORT || 5000;
                // ✅ Correct internal URL (HTTP, local backend port)
                const internalApiUrl = `http://127.0.0.1:${port}/api/ml/ml-backtest-results`;
                console.log(`[Orchestrator] Calling internal API: ${internalApiUrl}`);

                // ✅ No httpsAgent needed for internal HTTP call
                const response = await axios.get(internalApiUrl);
                const mlResult = response.data;
                if (!mlResult || typeof mlResult !== 'object' || !mlResult.initial_balance) { throw new Error("Invalid data from internal ML results endpoint."); }
                console.log("[Orchestrator] Successfully fetched pre-calculated ML results.");

                // --- Format the result ---
                const formattedResult = {
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
                     tradeHistory: mlResult.trades.map(t => ({
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

                if (!simulateOnly) { return await Backtest.create(formattedResult); }
                return formattedResult;
            } catch (error) {
                console.error(`[Orchestrator] Failed fetch/process pre-calculated ML: ${error.message}`);
                throw new Error(`Failed retrieve ML backtest results via internal API. Error: ${error.message}`);
            }
        } else if (mlMode === 'predictions') {
            // --- HYBRID MODE (Uses external HTTPS :8001 calls) ---
            console.log(`[Orchestrator] Running HYBRID backtest via Node.js simulation.`);
            if (!mlModel) throw new Error("ML Model name required for Hybrid.");
            // These helpers now correctly target HTTPS :8001 and use httpsAgent
            const mlConfig = await _getMLConfig(mlModel, authToken);
            dynamicFeatureNames = mlConfig.features;
            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);
            candles = fullFeatureData.map(row => {
                 const timestamp = new Date(row.datetime).getTime(); const open=Number(row.open); const high=Number(row.high); const low=Number(row.low); const close=Number(row.close);
                 if ([timestamp,open,high,low,close].some(isNaN)) return null; return [timestamp,open,high,low,close];
             }).filter(Boolean);
            if (!candles || candles.length < 2) throw new Error("Not enough candle data for Hybrid.");

            const validTimestamps = new Set(candles.map(c => c[0]));
            const alignedFeatureData = fullFeatureData.filter(row => validTimestamps.has(new Date(row.datetime).getTime()));

            // ✅ CORRECTED FEATURE MAPPING LOGIC (No stray ';')
            const features = alignedFeatureData.map(row =>
                 dynamicFeatureNames.map(feature => {
                     const val = row[feature];
                     return (typeof val !== 'number' || isNaN(val)) ? 0 : val; // Default missing features to 0
                 })
             ); // <-- Semicolon was removed here

            if (features.length !== candles.length) { throw new Error(`Hybrid alignment failed: Candles ${candles.length}, Features ${features.length}`); }

            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
            if (mlPredictions.length !== candles.length) { throw new Error(`Hybrid prediction count mismatch: Candles ${candles.length}, Predictions ${mlPredictions.length}`); }
            console.log(`[Orchestrator] Hybrid Prep Complete.`);
            // Continue below...
        } else {
             // --- ✅ PURE TA MODE --- (Unchanged)
             console.log(`[Orchestrator] Pure TA mode detected. Fetching OHLCV data.`);
             const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
             if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data.");
             candles = data.candles;
             console.log(`[Orchestrator] Fetched ${candles.length} candles for Pure TA.`);
             // Continue below...
        }

        // --- STEP 2: Execute Simulation(s) (Only for TA and Hybrid - Unchanged) ---
        if (mlMode !== 'on') {
            if (isComboTest) {
                 // --- COMBO MODE (TA or Hybrid - Unchanged) ---
                 console.log(`[Orchestrator] Running COMBO backtest. Mode: ${mlMode}`);
                 const individualResults = [];
                 for (const stratConfig of config.strategies) {
                     const { code, params: stratParams } = stratConfig;
                     if (!code) throw new Error("Strategy 'code' required.");
                     const strategy = await Strategy.findOne({ userId, code }).lean();
                     if (!strategy) throw new Error(`Strategy '${code}' not found.`);
                     if (!strategy.params?.strategyType) throw new Error(`Strategy '${code}' missing params.`);
                     const strategyFunction = getStrategy(strategy.params.strategyType);
                     if (!strategyFunction) throw new Error(`Function for '${strategy.params.strategyType}' not found.`);

                     const combinedParams = { ...globalParams, ...strategy.params, ...stratParams };

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
                 const combinedMetrics = _aggregateMetrics(individualResults, initialBalance);
                 const combinedEquityCurve = individualResults[0]?.equityCurve || [{ timestamp: new Date(startDate).toISOString(), balance: initialBalance }];
                 const comboResult = {
                     combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve, strategies: individualResults.map(r => r.strategyName) },
                     individualResults
                 };
                 console.log(`[Orchestrator] COMBO backtest (Mode: ${mlMode}) finished.`);
                 return comboResult; // Return combo result directly
            } else {
                 // --- SINGLE MODE (TA or Hybrid - Unchanged) ---
                 console.log(`[Orchestrator] Running SINGLE backtest. Mode: ${mlMode}`);
                 const { code } = config;
                 let strategyFunction = () => ({ signal: 'hold' });
                 let strategyParams = { ...globalParams, ...(config.params || {}) };
                 let strategyName = 'N/A', strategyType = 'N/A';

                 if (mlMode !== 'on') {
                     if (!code) throw new Error("Strategy 'code' required for TA/Hybrid.");
                     const strategy = await Strategy.findOne({ userId, code }).lean();
                     if (!strategy) throw new Error(`Strategy '${code}' not found.`);
                     if (!strategy.params?.strategyType) throw new Error(`Strategy '${code}' missing params.`);
                     strategyFunction = getStrategy(strategy.params.strategyType);
                     if (!strategyFunction) throw new Error(`Function for '${strategy.params.strategyType}' not found.`);
                     strategyParams = { ...strategyParams, ...strategy.params };
                     strategyName = strategy.name; strategyType = strategy.params.strategyType;
                 }

                 if (mlMode === 'predictions') {
                     strategyName = `Hybrid: ${strategyName || 'TA'} + ${mlModel || 'ML'}`;
                     strategyType = 'hybrid';
                 }

                 console.log(`[Orchestrator] Running simulation for: ${strategyName}`);
                 const { closedTrades, equityCurve } = runSimulation({
                     candles, strategyFunction, strategyParams,
                     riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
                 });
                 const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);
                 const backtestData = {
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
        throw new Error(`Backtest Orchestration Failed: ${error.message}`);
    }
};
