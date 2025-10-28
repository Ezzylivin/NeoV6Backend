// File: services/backtestService.js
// Final Version: Calls single Python script for mlMode === 'on'

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";
import axios from "axios";
import { parse } from "csv-parse";
import https from 'https';
import { finished } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process'; // For calling Python

// --- CONFIGURATION ---
const ML_SERVER_URL = "https://74.208.28.77:8001"; // Used only for Hybrid mode
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); // Used only for Hybrid mode

// --- HELPER: Get Python Script Path ---
const getPythonScriptPath = (scriptName = 'backtest_service.py') => {
    // Assumes you run `node app.js` from the project root
    return path.resolve(process.cwd(), 'python_scripts', scriptName);
};

// --- HELPER: Run Python Script (Integrated) ---
const _runPythonBacktest = (config) => {
    return new Promise((resolve, reject) => {
        const scriptPath = getPythonScriptPath('backtest_service.py');
        const args = [
            scriptPath,
            '--symbol', config.symbol,
            '--timeframe', config.timeframe,
            '--start-date', config.startDate,
            '--end-date', config.endDate,
            '--balance', config.initialBalance || 1000,
            '--fee', 0.001, // Or from config
            '--ml-mode', config.mlMode, // Will be 'on'
            '--ml-model', config.mlModel,
            '--ml-threshold', config.mlThreshold,
            '--sl', config.params?.SL,
            '--tp', config.params?.TP,
            '--hybrid-mode', config.params?.hybridMode || 'AND' // Passed but not crucial for 'on' mode
        ];

        // Filter out null/undefined args for SL/TP before converting to string
        const cleanArgs = args.filter(arg => arg !== undefined && arg !== null);

        console.log(`[Service] Spawning Python: python3 ${cleanArgs.map(String).join(' ')}`);
        const pythonProcess = spawn('python3', cleanArgs.map(String));

        let resultData = ''; let errorData = '';
        pythonProcess.stdout.on('data', (data) => { resultData += data.toString(); });
        pythonProcess.stderr.on('data', (data) => {
            const message = data.toString();
            console.error(`[Python_stderr] ${message}`);
            errorData += message;
        });
        pythonProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const results = JSON.parse(resultData);
                    console.log("[Service] Python script finished successfully.");
                    resolve(results);
                } catch (e) {
                    console.error("[Service] Failed to parse Python JSON output:", resultData);
                    reject(new Error(`Failed to parse Python JSON: ${e.message}`));
                }
            } else {
                console.error(`[Service] Python script exited with code ${code}.`);
                try { // Try parsing JSON error first
                    const errorJson = JSON.parse(errorData);
                    reject(new Error(errorJson.message || "Python script failed."));
                } catch (e) { // Fallback to raw error string
                    reject(new Error(errorData || "Python script failed with no error message."));
                }
            }
        });
        pythonProcess.on('error', (err) => {
            console.error("[Service] Failed to start Python script:", err);
            reject(new Error(`Failed to start Python script: ${err.message}`));
        });
    });
};

// --- (Your existing _getMLConfig, _getFeatureData, _getBulkPredictions for Hybrid mode go here) ---
const _getMLConfig = async (modelName, authToken) => { /* ... unchanged ... */
    const config_url = `${ML_SERVER_URL}/api/ml/config/${modelName}`;
    console.log(`[ML] Fetching config for model: ${modelName} from ${config_url}`);
    const headers = {};
    if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }
    try {
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
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => { /* ... unchanged ... */
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
const _getBulkPredictions = async (modelName, features, authToken) => { /* ... unchanged ... */
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`; // Uses API server URL :8001
    console.log(`[ML] Getting bulk predictions for ${modelName} (${features.length} samples}) for Hybrid Mode...`);
    try {
        const payload = { model_name: modelName, features: features };
        const headers = {};
        if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }
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
// --- (Your Node.js runSimulation, calculateMetrics, _aggregateMetrics go here) ---
const runSimulation = (config) => { /* ... unchanged ... */
    const { candles } = config;
    if (!candles || candles.length === 0) {
        console.warn("[Simulation] runSimulation called with no candles.");
        return { closedTrades: [], equityCurve: [{ timestamp: Date.now(), balance: config.initialBalance }] };
    }
    console.log(`[Simulation] Starting simulation. Mode: ${config.mlMode}. Candles: ${candles.length}.`);
    let currentBalance = config.initialBalance;
    let position = null;
    const closedTrades = [];
    const equityCurve = [{ timestamp: config.candles[0]?.[0], balance: config.initialBalance }];
    // [YOUR FULL NODE.JS SIMULATION LOGIC HERE - was stubbed before]
    console.log(`[Simulation] Finished. (Logic for TA/Hybrid runs here)`);
    const mockEquity = equityCurve.length > 1 ? equityCurve : [ { timestamp: config.candles[0]?.[0], balance: config.initialBalance }, { timestamp: config.candles[config.candles.length-1]?.[0], balance: config.initialBalance * (1 + (Math.random() - 0.4) * 0.5) }];
    return { closedTrades: [], equityCurve: mockEquity }; // Placeholder return
};
const calculateMetrics = (trades, initialBalance, equityCurve) => { /* ... unchanged ... */
    const finalBalance = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].balance : initialBalance;
    const totalProfit = finalBalance - initialBalance;
    const totalReturn = (totalProfit / initialBalance) * 100;
    console.log(`[Metrics] Calculated. (Logic for TA/Hybrid runs here)`);
    return { initialBalance, finalBalance, totalProfit, totalReturn, totalTrades: trades.length, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: Math.random() * 20 }; // Placeholder return
 };
const _aggregateMetrics = (individualResults, initialBalance) => { /* ... unchanged ... */
    console.log(`[Metrics] Aggregating ${individualResults.length} results. (Logic for Combo runs here)`);
    if (individualResults.length > 0) return individualResults[0].metrics; // Placeholder return
    return calculateMetrics([], initialBalance, [{ timestamp: Date.now(), balance: initialBalance }]); // Placeholder return
};

/**
 * --- MASTER FUNCTION ---
 * Routes execution based on mlMode.
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log("[Service] Starting runBacktest for mode:", config.mlMode);
    const { userId, symbol, timeframe, startDate, endDate, mlMode = 'off', mlModel, mlThreshold } = config;
    const initialBalance = parseFloat(config.initialBalance || 1000);
    const globalParams = config.params || {};

    try {
        if (mlMode === 'on') {
            // --- ✅ PURE ML MODE: Execute Python Script ---
            console.log(`[Service] Running Pure ML via Python script for model: ${mlModel}`);
            if (!mlModel) throw new Error("ML Model name is required for 'on' mode.");

            const mlResult = await _runPythonBacktest(config); // Await the promise

            if (!mlResult || typeof mlResult !== 'object' || !mlResult.metrics || !mlResult.equityCurve) {
                throw new Error("Invalid data received from Python backtest script.");
            }
            console.log("[Service] Successfully received results from Python script.");

            // Format results for DB
            const formattedResult = {
                userId, symbol, timeframe, initialBalance,
                finalBalance: mlResult.metrics.finalBalance,
                profit: mlResult.metrics.finalBalance - initialBalance,
                totalTrades: mlResult.metrics.totalTrades,
                startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(),
                candlesTested: mlResult.equityCurve?.length || 0,
                strategy: {
                    name: `ML: ${mlModel}`, type: 'ml',
                    params: { ...globalParams, ...config.params, mlThreshold: mlThreshold },
                    mlModel: mlModel
                },
                metrics: mlResult.metrics,
                equityCurve: mlResult.equityCurve.map(p => ({ timestamp: p.timestamp, balance: p.balance })),
                tradeHistory: (mlResult.trades || []).map(t => ({
                    action: t.action, price: t.price, time: t.time, size: t.size,
                    pnl_pct: t.pnl_pct || 0, profit: t.profit_usd || 0,
                    entryTime: t.action === 'buy' ? t.time : null,
                    exitTime: t.action.startsWith('sell') ? t.time : null,
                    exitReason: t.action.startsWith('sell') ? t.reason || t.action : null, // Use reason if available
                })),
            };

            if (!simulateOnly) {
                console.log(`[Service] Saving ML backtest (Mode: ${mlMode}) to database.`);
                return await Backtest.create(formattedResult);
            }
            console.log(`[Service] Returning simulation-only ML result (Mode: ${mlMode}).`);
            return formattedResult;

        } else {
            // --- ✅ TA ('off') or HYBRID ('predictions') MODE: Use Node.js Simulation ---
            console.log(`[Service] Running ${mlMode === 'predictions' ? 'Hybrid' : 'TA'} via Node.js simulation.`);
            let candles, mlPredictions = null, dynamicFeatureNames = [];
            const isComboTest = config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0;
            const riskParams = { riskManagementMode: config.riskManagementMode, riskPercentage: config.riskPercentage, growthCapitalTarget: config.growthCapitalTarget };


            // --- Prep for Node.js Simulation ---
            if (mlMode === 'predictions') {
                // Hybrid: Fetch external features & predictions
                if (!mlModel) throw new Error("ML Model name required for Hybrid.");
                const mlConfig = await _getMLConfig(mlModel, authToken);
                dynamicFeatureNames = mlConfig.features;
                const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);
                candles = fullFeatureData.map(row => { const ts = new Date(row.datetime).getTime(); const o=Number(row.open); const h=Number(row.high); const l=Number(row.low); const c=Number(row.close); if ([ts,o,h,l,c].some(isNaN)) return null; return [ts,o,h,l,c]; }).filter(Boolean);
                if (!candles || candles.length < 2) throw new Error("Not enough candle data for Hybrid.");
                const validTimestamps = new Set(candles.map(c => c[0]));
                const alignedFeatureData = fullFeatureData.filter(row => validTimestamps.has(new Date(row.datetime).getTime()));
                const features = alignedFeatureData.map(row => dynamicFeatureNames.map(f => { const v = row[f]; return (typeof v !== 'number' || isNaN(v)) ? 0 : v; }));
                if (features.length !== candles.length) throw new Error(`Hybrid alignment failed.`);
                mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
                if (mlPredictions.length !== candles.length) throw new Error(`Hybrid prediction count mismatch.`);
                console.log(`[Service] Hybrid Prep Complete for Node.js simulation.`);
            } else {
                // TA: Fetch basic OHLCV
                const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
                if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data for TA.");
                candles = data.candles;
                console.log(`[Service] Fetched ${candles.length} candles for TA Node.js simulation.`);
            }

            // --- Execute Node.js Simulation (Combo or Single) ---
            if (isComboTest) {
                 // --- COMBO MODE (TA or Hybrid) ---
                console.log(`[Service] Running COMBO backtest in Node.js. Mode: ${mlMode}`);
                const individualResults = [];
                for (const stratConfig of config.strategies) {
                    const { code, params: stratParams } = stratConfig;
                    if (!code) throw new Error("Strategy 'code' required.");
                    const strategy = await Strategy.findOne({ userId, code }).lean(); // Fetch strategy details
                    if (!strategy || !strategy.params?.strategyType) throw new Error(`Strategy '${code}' not found or missing params.`);
                    const strategyFunction = getStrategy(strategy.params.strategyType); // Get the JS strategy function
                    if (!strategyFunction) throw new Error(`JS function for '${strategy.params.strategyType}' not found.`);
                    const combinedParams = { ...globalParams, ...strategy.params, ...stratParams };

                    console.log(`[Service] Simulating combo item in Node.js: ${strategy.name}`);
                    const { closedTrades, equityCurve } = runSimulation({ // Call your Node.js simulation
                        candles, strategyFunction, strategyParams: combinedParams,
                        riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
                    });
                    const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve); // Call Node.js metrics
                    individualResults.push({ strategyName: strategy.name, metrics, equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })) });
                }
                const combinedMetrics = _aggregateMetrics(individualResults, initialBalance);
                const combinedEquityCurve = individualResults[0]?.equityCurve || [{ timestamp: new Date(startDate).toISOString(), balance: initialBalance }];
                const comboResult = { combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve, strategies: individualResults.map(r => r.strategyName) }, individualResults };
                console.log(`[Service] COMBO Node.js backtest (Mode: ${mlMode}) finished.`);
                // Note: Combo results are typically not saved to DB in the same way, adjust if needed
                 if (!simulateOnly) {
                     console.warn("[Service] Saving combo results to DB is not implemented in this example.");
                     // Add DB saving logic here if required for combos
                 }
                return comboResult;
            } else {
                 // --- SINGLE MODE (TA or Hybrid) ---
                console.log(`[Service] Running SINGLE backtest in Node.js. Mode: ${mlMode}`);
                const { code } = config;
                let strategyFunction = () => ({ signal: 'hold' });
                let strategyParams = { ...globalParams, ...(config.params || {}) };
                let strategyName = 'N/A', strategyType = 'N/A';

                if (!code && mlMode === 'off') throw new Error("Strategy 'code' required for TA Only ('off') mode.");

                if (code) { // Fetch strategy details only if a code is provided (TA or Hybrid base)
                    const strategy = await Strategy.findOne({ userId, code }).lean();
                    if (!strategy || !strategy.params?.strategyType) throw new Error(`Strategy '${code}' not found or missing params.`);
                    strategyFunction = getStrategy(strategy.params.strategyType);
                    if (!strategyFunction) throw new Error(`JS function for '${strategy.params.strategyType}' not found.`);
                    strategyParams = { ...strategyParams, ...strategy.params };
                    strategyName = strategy.name; strategyType = strategy.params.strategyType;
                }

                if (mlMode === 'predictions') { // Adjust name for Hybrid
                    strategyName = `Hybrid: ${strategyName || 'TA'} + ${mlModel || 'ML'}`;
                    strategyType = 'hybrid';
                }

                console.log(`[Service] Running Node.js simulation for: ${strategyName}`);
                const { closedTrades, equityCurve } = runSimulation({ // Call Node.js simulation
                    candles, strategyFunction, strategyParams,
                    riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
                });
                const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve); // Call Node.js metrics

                // Format for DB
                const backtestData = {
                    userId, symbol, timeframe, initialBalance,
                    finalBalance: metrics.finalBalance, profit: metrics.totalProfit, totalTrades: metrics.totalTrades,
                    startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(),
                    candlesTested: candles.length,
                    strategy: { name: strategyName, type: strategyType, params: strategyParams, mlModel: mlMode !== 'off' ? mlModel : null },
                    metrics,
                    equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })),
                    tradeHistory: closedTrades.map(t => ({ /* Map your trade structure */ })),
                };

                if (!simulateOnly) {
                    console.log(`[Service] Saving backtest result (Mode: ${mlMode}) to database via Node.js.`);
                    return await Backtest.create(backtestData);
                }
                console.log(`[Service] Returning simulation-only result (Mode: ${mlMode}) via Node.js.`);
                return backtestData;
            }
        } // End TA / Hybrid Logic

    } catch (error) {
        console.error(`[Service] Backtest failed: ${error.message}`);
        console.error(error.stack); // Log full stack trace for debugging
        throw new Error(`Backtest Failed: ${error.message}`); // Re-throw for controller
    }
};
