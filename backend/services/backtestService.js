// File: services/backtestService.js
// FINAL VERSION V4.2: Integrated Python 'spawn' for mlMode === 'on'

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
import { spawn } from 'child_process'; // --- 🚀 NEW: Import spawn ---

// --- CONFIGURATION ---
const ML_SERVER_URL = "https://74.208.28.77:8001";
// --------------------------------------------------------

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- 🚀 NEW HELPER 1: Get Python Script Path ---
const getPythonScriptPath = () => {
    // !! IMPORTANT: UPDATE THIS PATH !!
    // This path must be relative to where you RUN `node app.js`
    
    // If you run `node app.js` from the root of your project (e.g., /my-project/):
    return path.resolve(process.cwd(), 'python_scripts', 'backtest_service.py');
    
    // If you run `node app.js` from the '/backend' folder:
    // return path.resolve(process.cwd(), '..', 'python_scripts', 'backtest_service.py');
};
// --- 🚀 END NEW ---


// --- 🚀 NEW HELPER 2: Promise-wrapped Python Executor ---
/**
 * Runs the python backtest script as a child process.
 * @param {object} config - The config object from the React form
 * @returns {Promise<object>} A promise that resolves with the JSON results
 */
const _runPythonBacktest = (config) => {
    // This function returns a Promise, which is why your
    // controller can 'await' it.
    return new Promise((resolve, reject) => {
        
        // 1. Build the command-line arguments for the Python script
        const scriptPath = getPythonScriptPath();
        const args = [
            scriptPath,
            '--balance', config.initialBalance || 1000,
            '--symbol', config.symbol,
            '--timeframe', config.timeframe,
            '--start-date', config.startDate,
            '--end-date', config.endDate,
            '--strategy-code', config.code, // Python script may not use this in 'on' mode
            '--ml-mode', config.mlMode,
            '--ml-model', config.mlModel,
            '--ml-threshold', config.mlThreshold,
        ];

        // Add params (SL, TP, etc.)
        if (config.params) {
            if (config.params.SL) args.push('--sl', config.params.SL);
            if (config.params.TP) args.push('--tp', config.params.TP);
            if (config.params.minAtrPct) args.push('--min-atr', config.params.minAtrPct);
            if (config.params.trendFilterPeriod) args.push('--trend-period', config.params.trendFilterPeriod);
            if (config.params.hybridMode) args.push('--hybrid-mode', config.params.hybridMode);
        }
        
        // 2. Spawn the Python process
        console.log(`[Orchestrator] Spawning Python script: python3 ${args.join(' ')}`);
        const pythonProcess = spawn('python3', args.map(String)); // Use 'python' or 'python3'
        
        let resultData = ''; // Stores the final JSON string from stdout
        let errorData = ''; // Stores any error messages from stderr

        // 3. Listen for the script's output
        pythonProcess.stdout.on('data', (data) => {
            resultData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            // Log python's stderr messages (like 'Mock Data: Loading...')
            console.error(`[Python_stderr] ${data.toString()}`);
            errorData += data.toString();
        });

        // 4. Handle the script finishing
        pythonProcess.on('close', (code) => {
            if (code === 0) { // Success
                try {
                    const results = JSON.parse(resultData);
                    console.log("[Orchestrator] Python script finished successfully.");
                    resolve(results); // Resolve the promise with the results
                } catch (e) {
                    console.error("[Orchestrator] Failed to parse Python script output:", resultData);
                    reject(new Error(`Failed to parse Python script output: ${e.message}`));
                }
            } else { // Failure
                console.error(`[Orchestrator] Python script exited with code ${code}.`);
                try {
                    // Try to parse the JSON error from Python (which we print to stderr)
                    const errorJson = JSON.parse(errorData);
                    reject(new Error(errorJson.message || "Python script failed."));
                } catch(e) {
                    // The error wasn't JSON, just send the raw string
                    reject(new Error(errorData || "Python script failed with no error message."));
                }
            }
        });

        // 5. Handle errors in the spawn process itself
        pythonProcess.on('error', (err) => {
            console.error("[Orchestrator] Failed to start Python script:", err);
            reject(new Error(`Failed to start Python script: ${err.message}`));
        });
    });
};
// --- 🚀 END NEW ---


/**
 * Fetches the model's configuration from the ML server API (:8001).
 * (Unchanged - Used for Hybrid Mode)
 */
const _getMLConfig = async (modelName, authToken) => {
    // ... (no changes to this function)
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


/**
 * Downloads feature file using streams (via ML Server API :8001).
 * (Unchanged - Used for Hybrid Mode)
 */
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    // ... (no changes to this function)
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

/**
 * Gets bulk ML predictions (via ML Server API :8001).
 * (Unchanged - Used for Hybrid Mode)
 */
const _getBulkPredictions = async (modelName, features, authToken) => {
    // ... (no changes to this function)
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


/**
 * --- SIMULATION ENGINE --- (Unchanged functionally)
 */
const runSimulation = (config) => {
    // ... (This function remains exactly as before) ...
    return { closedTrades: [], equityCurve: [{ timestamp: config.candles[0]?.[0], balance: config.initialBalance }] }; // Placeholder
};


/**
 * Calculates metrics. (Unchanged)
 */
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    // ... (This function remains exactly as before) ...
    return { /* metrics */ }; // Placeholder
};

/**
 * Aggregates metrics for combo tests. (Unchanged)
 */
const _aggregateMetrics = (individualResults, initialBalance) => {
    // ... (This function remains exactly as before) ...
    return { /* aggregated metrics */ }; // Placeholder
};


/**
 * --- MASTER ORCHESTRATOR ---
 * Uses internal Python 'spawn' for Pure ML mode results.
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
        // --- 🚀 REPLACED: This entire block is new ---
        if (mlMode === 'on') {
            // --- ✅ PURE ML MODE (via Python Script) ---
            console.log(`[Orchestrator] Spawning Python script for model: ${mlModel || 'default'}`);
            
            // 1. Call the new helper function that runs the python script
            // The python script will load its own data and run the full backtest
            const mlResult = await _runPythonBacktest(config);
            
            // 2. The 'mlResult' is the direct JSON output from the python script.
            //    We just need to format it for the database.
            if (!mlResult || typeof mlResult !== 'object' || !mlResult.metrics || !mlResult.equityCurve) { 
                throw new Error("Invalid data from Python script.");
            }
            console.log("[Orchestrator] Successfully received results from Python script.");

            // 3. Format the result
            //    (This maps from your Python script's output to your DB schema)
            const formattedResult = {
                userId, symbol, timeframe, initialBalance,
                finalBalance: mlResult.metrics.finalBalance,
                profit: mlResult.metrics.finalBalance - initialBalance,
                totalTrades: mlResult.metrics.totalTrades,
                startDate: new Date(startDate).toISOString(),
                endDate: new Date(endDate).toISOString(),
                candlesTested: mlResult.equityCurve?.length || 0,
                strategy: {
                    name: `ML: ${mlModel || 'Default'}`,
                    type: 'ml',
                    params: { ...globalParams, mlThreshold: mlThreshold },
                    mlModel: mlModel || 'Default'
                },
                // The python script's 'metrics' object matches the DB schema
                metrics: mlResult.metrics,
                
                // Map equity curve
                equityCurve: mlResult.equityCurve.map(p => ({
                    timestamp: p.timestamp, // Already an ISO string from python
                    balance: p.balance
                })),
                
                // Map trade history
                tradeHistory: mlResult.trades.map(t => ({
                    action: t.action,
                    price: t.price,
                    time: t.time, // Already an ISO string from python
                    size: t.size,
                    pnl_pct: t.pnl_pct || 0,
                    profit: t.profit_usd || 0,
                    entryTime: t.action === 'buy' ? t.time : null,
                    exitTime: t.action.startsWith('sell') ? t.time : null,
                    exitReason: t.action.startsWith('sell') ? t.action : null, // e.g., 'sell_sl', 'sell_tp'
                })),
            };

            if (!simulateOnly) {
                console.log(`[Orchestrator] Saving ML backtest (Mode: ${mlMode}) to database.`);
                return await Backtest.create(formattedResult);
            }
            console.log(`[Orchestrator] Returning simulation-only ML result (Mode: ${mlMode}).`);
            return formattedResult;
        
        // --- 🚀 END REPLACED ---
        
        } else if (mlMode === 'predictions') {
            // --- HYBRID MODE (Unchanged) ---
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
            
            const features = alignedFeatureData.map(row =>
                dynamicFeatureNames.map(feature => {
                    const val = row[feature];
                    return (typeof val !== 'number' || isNaN(val)) ? 0 : val; // Default missing features to 0
                })
            );

            if (features.length !== candles.length) { throw new Error(`Hybrid alignment failed: Candles ${candles.length}, Features ${features.length}`); }

            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
            if (mlPredictions.length !== candles.length) { throw new Error(`Hybrid prediction count mismatch: Candles ${candles.length}, Predictions ${mlPredictions.length}`); }
            console.log(`[Orchestrator] Hybrid Prep Complete.`);
            // Continue below...
        } else {
            // --- PURE TA MODE (Unchanged) ---
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
                // ... (no changes to this logic) ...
            } else {
                // --- SINGLE MODE (TA or Hybrid - Unchanged) ---
                console.log(`[Orchestrator] Running SINGLE backtest. Mode: ${mlMode}`);
                // ... (no changes to this logic) ...
            }
        } // End if (mlMode !== 'on')

    } catch (error) {
        console.error(`[Orchestrator] Backtest failed: ${error.message}`);
        console.error(error.stack);
        throw new Error(`Backtest Orchestration Failed: ${error.message}`);
    }
};
