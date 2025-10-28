// File: backend/services/backtestService.js
// Final Version: Strict separation based on mlMode

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js"; // For Node.js TA/Hybrid data
import { getStrategy } from "../strategies/strategyManager.js"; // For Node.js TA/Hybrid simulation
import axios from "axios"; // For Hybrid external calls
import { parse } from "csv-parse"; // For Hybrid external calls
import https from 'https'; // For Hybrid external calls
import { finished } from 'stream/promises'; // For Hybrid external calls
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process'; // For calling Python in ML 'on' mode
import fs from 'fs/promises'; // For cache directory check
import crypto from 'crypto'; // For cache filename generation

// --- Configuration ---
const ML_SERVER_URL = "https://74.208.28.77:8001"; // Used ONLY for mlMode === 'predictions'
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); // Used ONLY for mlMode === 'predictions'
const RESULTS_CACHE_DIR = path.resolve(process.cwd(), 'python_data', 'results'); // Cache dir for ML 'on' mode

// --- HELPER: Get Python Script Path (Only for ML 'on' mode) ---
const getPythonScriptPath = (scriptName = 'backtest_service.py') => {
    // Assumes you run `node app.js` from the project root
    return path.resolve(process.cwd(), 'python_scripts', scriptName);
};

// --- HELPER: Run Python Script (Only for ML 'on' mode) ---
const _runPythonBacktest = (config) => {
    return new Promise((resolve, reject) => {
        const scriptPath = getPythonScriptPath('backtest_service.py');
        const args = [
            scriptPath,
            // Core
            '--symbol', config.symbol,
            '--timeframe', config.timeframe,
            '--start-date', config.startDate,
            '--end-date', config.endDate,
            '--balance', config.initialBalance || 1000,
            '--fee', 0.001, // Or from config
            // ML
            '--ml-mode', 'on',
            '--ml-model', config.mlModel,
            '--ml-threshold', config.mlThreshold,
            // Risk - Arguments added
            '--risk-mode', config.riskManagementMode || 'standard',
            '--risk-percent', config.riskPercentage || 1.0,
            '--growth-target', config.growthCapitalTarget, // Pass null/undefined if not set
            // Params/Filters - Arguments added
            '--sl', config.params?.SL,
            '--tp', config.params?.TP,
            '--min-atr', config.params?.minAtrPct,
            '--trend-period', config.params?.trendFilterPeriod,
            // Other
            '--hybrid-mode', config.params?.hybridMode || 'AND' // Still pass even if ignored by Python
        ];

        // ❗ FIXED: Filter null/undefined values *once* before spawning
        const cleanArgs = args.filter(arg => arg !== undefined && arg !== null);

        console.log(`[Service_PyExec] Spawning Python: python3 ${cleanArgs.map(String).join(' ')}`);
        // Use cleanArgs here
        const pythonProcess = spawn('python3', cleanArgs.map(String));

        let resultData = ''; let errorData = '';
        pythonProcess.stdout.on('data', (data) => { resultData += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { console.error(`[Python_stderr] ${data.toString()}`); errorData += data.toString(); });
        pythonProcess.on('close', (code) => {
            if (code === 0) { // Success
                try {
                    const results = JSON.parse(resultData);
                    console.log("[Service_PyExec] Python script finished successfully.");
                    resolve(results);
                } catch (e) {
                    console.error("[Service_PyExec] Failed to parse Python JSON:", resultData);
                    reject(new Error(`Parse Error: ${e.message}`));
                }
            } else { // Failure
                console.error(`[Service_PyExec] Python script failed (code ${code}).`);
                try {
                    const errJson = JSON.parse(errorData);
                    reject(new Error(errJson.message || "Python script error."));
                } catch (e) {
                    reject(new Error(errorData || "Python script failed, no stderr."));
                }
            }
        });
        pythonProcess.on('error', (err) => {
            console.error("[Service_PyExec] Spawn Error:", err);
            reject(new Error(`Spawn Error: ${err.message}`));
        });
    });
};

// --- HELPER: Generate Cache Filename (Only for ML 'on' mode) ---
const generateCacheFilename = (config) => {
    const paramsKey = JSON.stringify({
        sym: config.symbol, tf: config.timeframe, sd: config.startDate, ed: config.endDate,
        mlm: config.mlModel, mlt: config.mlThreshold,
        sl: config.params?.SL ?? 'none', tp: config.params?.TP ?? 'none',
    });
    const hash = crypto.createHash('sha256').update(paramsKey).digest('hex');
    return `${hash}.json`;
};


// --- Helper Functions for HYBRID Mode (External Server) ---
// These are only used if mlMode === 'predictions'
const _getMLConfig = async (modelName, authToken) => { /* ... unchanged ... */
    const config_url = `${ML_SERVER_URL}/api/ml/config/${modelName}`; console.log(`[Hybrid] Fetching config: ${config_url}`); const headers = {}; if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }
    try { const response = await axios.get(config_url, { httpsAgent: httpsAgent, headers, timeout: 15000 }); if (!response.data?.features?.length) { throw new Error("Invalid config format from ML server."); } console.log(`[Hybrid] Got ${response.data.features.length} features.`); return response.data; }
    catch (error) { let msg = `ML config fetch failed: ${error.message}`; if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`; else if (error.response) msg += ` Status: ${error.response.status}. ${JSON.stringify(error.response.data)}`; console.error(`[Hybrid] ${msg}`); throw new Error(msg); }
};
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => { /* ... unchanged ... */
    const data_filename = `${symbol.replace('/', '')}-${timeframe}-features.csv`; const data_url = `${ML_SERVER_URL}/data/${data_filename}`; console.log(`[Hybrid] Streaming features: ${data_url}`);
    const start_ms = new Date(startDate + 'T00:00:00.000Z').getTime(); const end_ms = new Date(endDate + 'T23:59:59.999Z').getTime(); if (isNaN(start_ms) || isNaN(end_ms)) throw new Error("Invalid date."); const filteredData = [];
    const parser = parse({ columns: true, skip_empty_lines: true, cast: (v, c) => { if (c.header || c.column === 'datetime') return v; const n = Number(v); return (!isNaN(n) && v !== null && String(v).trim() !== '') ? n : v; } });
    parser.on('readable', () => { let r; while ((r = parser.read()) !== null) { const row_ms = new Date(r.datetime).getTime(); if (!isNaN(row_ms) && row_ms >= start_ms && row_ms <= end_ms) { Object.keys(r).forEach(k => { if (k !== 'datetime' && typeof r[k] === 'string') { const n = Number(r[k]); if (!isNaN(n) && r[k].trim() !== '') r[k] = n; } }); filteredData.push(r); } } });
    parser.on('error', (err) => { throw new Error(`CSV stream parse error: ${err.message}`); });
    try { const response = await axios.get(data_url, { responseType: 'stream', httpsAgent: httpsAgent, timeout: 300000 }); response.data.pipe(parser); await finished(parser); if (filteredData.length === 0) throw new Error(`No feature data found for range in ${data_filename}.`); console.log(`[Hybrid] Found ${filteredData.length} rows.`); return filteredData; }
    catch (error) { let msg = `Feature stream failed: ${error.message}`; if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`; else if (error.response) msg += ` Status: ${error.response.status}. ${JSON.stringify(error.response.data)}`; console.error(`[Hybrid] ${msg}`); throw new Error(msg); }
};
const _getBulkPredictions = async (modelName, features, authToken) => { /* ... unchanged ... */
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`; console.log(`[Hybrid] Getting ${features.length} bulk predictions...`);
    try { const payload = { model_name: modelName, features: features }; const headers = {}; if (authToken) headers['Authorization'] = `Bearer ${authToken}`; const response = await axios.post(bulk_url, payload, { httpsAgent: httpsAgent, headers, timeout: 180000 }); const preds = response.data.predictions.map(p => (typeof p === 'number') ? { prediction: p, probability: 1.0 } : (p?.prediction !== undefined && p?.probability !== undefined) ? p : { prediction: 0, probability: 0.0 }); console.log(`[Hybrid] Got ${preds.length} predictions.`); return preds; }
    catch (error) { let msg = `Bulk prediction failed: ${error.message}`; if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`; else if (error.response) msg += ` Status: ${error.response.status}. ${JSON.stringify(error.response.data)}`; console.error(`[Hybrid] ${msg}`); throw new Error(msg); }
};

// --- Helper Functions for Node.js Simulation (TA / Hybrid / Combo) ---
// 🚀 Replace these stubs with your actual Node.js simulation and metrics logic
const runSimulation = (config) => {
    const { candles } = config; if (!candles || candles.length === 0) return { closedTrades: [], equityCurve: [{ timestamp: Date.now(), balance: config.initialBalance }] };
    console.log(`[NodeSim] Starting simulation. Mode: ${config.mlMode}. Candles: ${candles.length}. (Stubbed)`);
    // [YOUR FULL NODE.JS SIMULATION LOGIC HERE for TA and Hybrid]
    const mockEquity = [{ timestamp: config.candles[0]?.[0], balance: config.initialBalance }, { timestamp: config.candles[config.candles.length-1]?.[0], balance: config.initialBalance * (1 + (Math.random() - 0.4) * 0.5) }];
    return { closedTrades: [], equityCurve: mockEquity }; // Placeholder
};
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    const finalBalance = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].balance : initialBalance; const totalProfit = finalBalance - initialBalance; const totalReturn = (totalProfit / initialBalance) * 100;
    console.log(`[NodeSim] Calculated metrics. (Stubbed)`);
    return { initialBalance, finalBalance, totalProfit, totalReturn, totalTrades: trades.length, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: Math.random() * 20 }; // Placeholder
};
const _aggregateMetrics = (individualResults, initialBalance) => {
    console.log(`[NodeSim] Aggregating ${individualResults.length} results. (Stubbed)`);
    if (individualResults.length > 0) return individualResults[0].metrics; // Placeholder
    return calculateMetrics([], initialBalance, [{ timestamp: Date.now(), balance: initialBalance }]); // Placeholder
};

// --- Helper: Format Python Result ---
const formatPythonResult = (pyResult, config) => {
     const { userId, symbol, timeframe, startDate, endDate, mlMode, mlModel, code } = config;
     const initialBalance = parseFloat(config.initialBalance);
     // Basic validation of Python result structure
     if (!pyResult?.metrics || !pyResult?.equityCurve) {
        console.error("[Service] Invalid structure received from Python script:", pyResult);
        throw new Error("Received invalid result structure from Python backtest.");
     }
     return {
         userId, symbol, timeframe, initialBalance,
         finalBalance: pyResult.metrics.finalBalance,
         profit: pyResult.metrics.finalBalance - initialBalance,
         totalTrades: pyResult.metrics.totalTrades,
         startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(),
         candlesTested: pyResult.equityCurve?.length || 0,
         strategy: { name: `Py: ${mlModel}`, type: 'ml', params: { ...config.params, mlThreshold: config.mlThreshold }, mlModel: mlModel, taCode: null }, // ML 'on' doesn't use taCode
         metrics: pyResult.metrics,
         equityCurve: pyResult.equityCurve.map(p => ({ timestamp: p.timestamp, balance: p.balance })),
         tradeHistory: (pyResult.trades || []).map(t => ({ action: t.action, price: t.price, time: t.time, size: t.size, pnl_pct: t.pnl_pct || 0, profit: t.profit_usd || 0, entryTime: t.action === 'buy' ? t.time : null, exitTime: t.action.startsWith('sell') ? t.time : null, exitReason: t.action.startsWith('sell') ? t.reason || t.action : null })),
     };
};

/**
 * --- MASTER FUNCTION (Single Backtest - Strict Separation) ---
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log(`[Service] Starting runBacktest. Mode: ${config.mlMode}`);
    const { userId, symbol, timeframe, startDate, endDate, mlMode = 'off', mlModel, mlThreshold, code } = config; // code is TA strategy code
    const initialBalance = parseFloat(config.initialBalance || 1000);
    const globalParams = config.params || {};

    try {
        // --- BRANCH 1: Pure ML ('on') -> Use Python Script ---
        if (mlMode === 'on') {
            console.log(`[Service] Running Pure ML via Python script for model: ${mlModel}`);
            if (!mlModel) throw new Error("ML Model name is required for 'on' mode.");

            // --- Caching Logic ---
            const cacheFilename = generateCacheFilename(config);
            const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);
            console.log(`[Service] Checking cache file: ${cacheFilePath}`);
            try {
                await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true });
                const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
                console.log(`[Service] Cache HIT for ${cacheFilename}.`);
                const mlResult = JSON.parse(cachedData);
                const formattedResult = formatPythonResult(mlResult, config); // Format cached data
                // Optional: Save cache hit to DB if needed
                // if (!simulateOnly) return await Backtest.create(formattedResult);
                return formattedResult;
            } catch (error) {
                if (error.code === 'ENOENT') { // Cache Miss
                    console.log(`[Service] Cache MISS. Running Python script...`);
                    const mlResult = await _runPythonBacktest(config); // Run Python
                    // --- Save to Cache ---
                    try { await fs.writeFile(cacheFilePath, JSON.stringify(mlResult, null, 2), 'utf-8'); console.log(`[Service] Saved result to cache: ${cacheFilePath}`); }
                    catch (saveError) { console.error(`[Service] WARNING: Failed to save to cache: ${saveError.message}`); }
                    // --- Format & Return/Save ---
                    const formattedResult = formatPythonResult(mlResult, config);
                    if (!simulateOnly) { console.log(`[Service] Saving NEW ML backtest to DB.`); return await Backtest.create(formattedResult); }
                    console.log(`[Service] Returning NEW simulation-only ML result.`); return formattedResult;
                } else { // Other cache read error
                    console.error(`[Service] Error reading cache file ${cacheFilePath}: ${error.message}`);
                    throw new Error(`Cache read error: ${error.message}`);
                }
            } // End Caching Logic

        }
        // --- BRANCH 2: TA ('off') or Hybrid ('predictions') -> Use Node.js Simulation ---
        else {
            console.log(`[Service] Running ${mlMode === 'predictions' ? 'Hybrid' : 'TA'} via Node.js simulation.`);
            let candles, mlPredictions = null;
            const riskParams = { riskManagementMode: config.riskManagementMode, riskPercentage: config.riskPercentage, growthCapitalTarget: config.growthCapitalTarget };

            // --- Prep for Node.js Simulation ---
            if (mlMode === 'predictions') { // Hybrid Prep
                if (!mlModel) throw new Error("ML Model name required for Hybrid mode.");
                if (!code) throw new Error("Base TA Strategy 'code' required for Hybrid mode."); // Need TA base
                const mlConfig = await _getMLConfig(mlModel, authToken); const dynFeatures = mlConfig.features;
                const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);
                candles = fullFeatureData.map(r => { const t=new Date(r.datetime).getTime(),o=Number(r.open),h=Number(r.high),l=Number(r.low),c=Number(r.close); return [t,o,h,l,c]; }).filter(c=>!c.some(isNaN));
                if (!candles?.length) throw new Error("No valid candle data extracted for Hybrid.");
                const validTs = new Set(candles.map(c => c[0])); const alignedFeat = fullFeatureData.filter(r => validTs.has(new Date(r.datetime).getTime()));
                const features = alignedFeat.map(r => dynFeatures.map(f => { const v=r[f]; return (typeof v!=='number'||isNaN(v))?0:v; }));
                if (features.length !== candles.length) throw new Error(`Hybrid alignment fail.`);
                mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
                if (mlPredictions.length !== candles.length) throw new Error(`Hybrid prediction count mismatch.`);
            } else { // TA Prep
                if (!code) throw new Error("Strategy 'code' required for TA Only ('off') mode.");
                const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
                if (!data.candles?.length) throw new Error("Not enough market data for TA.");
                candles = data.candles;
            }

            // --- Get Node.js Strategy Function ---
            const strategy = await Strategy.findOne({ userId, code }).lean();
            if (!strategy?.params?.strategyType) throw new Error(`TA Strategy '${code}' not found or missing params.`);
            const strategyFunction = getStrategy(strategy.params.strategyType); // Get the JS strategy function
            if (!strategyFunction) throw new Error(`Node.js function for TA strategy type '${strategy.params.strategyType}' not found.`);
            const strategyParams = { ...globalParams, ...strategy.params, ...config.params }; // Combine all params
            const strategyName = mlMode === 'predictions' ? `Hybrid: ${strategy.name} + ${mlModel}` : strategy.name;

            // --- Execute Node.js Simulation ---
            console.log(`[Service] Running Node.js simulation for: ${strategyName}`);
            const { closedTrades, equityCurve } = runSimulation({ // Call Node.js simulation
                candles, strategyFunction, strategyParams,
                riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
            });
            const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve); // Call Node.js metrics

            // --- Format & Save/Return ---
            const backtestData = {
                userId, symbol, timeframe, initialBalance, finalBalance: metrics.finalBalance, profit: metrics.totalProfit, totalTrades: metrics.totalTrades, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), candlesTested: candles.length,
                strategy: { name: strategyName, type: mlMode, params: strategyParams, mlModel: mlMode === 'predictions' ? mlModel : null, taCode: code },
                metrics, equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })),
                tradeHistory: closedTrades.map(t => ({ /* Map your Node.js trade structure */ })),
            };
            if (!simulateOnly) { console.log(`[Service] Saving ${mlMode} backtest to DB via Node.js.`); return await Backtest.create(backtestData); }
            console.log(`[Service] Returning simulation-only ${mlMode} result via Node.js.`); return backtestData;
        } // End TA / Hybrid Logic

    } catch (error) {
        console.error(`[Service] Backtest failed: ${error.message}`);
        console.error(error.stack); // Log full stack trace
        throw new Error(`Backtest Failed: ${error.message}`); // Re-throw
    }
};

/**
 * --- MASTER ORCHESTRATOR (Combo Backtest - Uses Node Simulation) ---
 * Runs multiple simulations based on the combo config using Node.js engine.
 * Fetches external predictions if combo mlMode is 'predictions'.
 */
export const runCombinedStrategyService = async (userId, comboConfig, authToken) => {
    console.log("[Service] Starting COMBO backtest (Node.js Simulation) with config:", comboConfig);
    const { strategies, symbol, timeframe, startDate, endDate, mlMode, mlModel, mlThreshold } = comboConfig;
    const initialBalance = parseFloat(comboConfig.initialBalance || 1000);
    const globalComboParams = comboConfig.params || {}; // Global settings for the combo itself

    let candles, mlPredictions = null;

    try {
        // --- 1. Prepare Data (Once for all strategies in combo) ---
        if (mlMode === 'predictions') { // Hybrid Combo Prep
             if (!mlModel) throw new Error("ML Model name required for Hybrid combo.");
             console.log(`[ComboService] Hybrid combo prep: Fetching external data/preds for ${mlModel}`);
             const mlConfig = await _getMLConfig(mlModel, authToken); const dynFeatures = mlConfig.features;
             const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);
             candles = fullFeatureData.map(r=>{const t=new Date(r.datetime).getTime(),o=Number(r.open),h=Number(r.high),l=Number(r.low),c=Number(r.close); return [t,o,h,l,c];}).filter(c=>!c.some(isNaN));
             if (!candles?.length) throw new Error("No valid candle data for Hybrid combo.");
             const validTs = new Set(candles.map(c => c[0])); const alignedFeat = fullFeatureData.filter(r => validTs.has(new Date(r.datetime).getTime()));
             const features = alignedFeat.map(r => dynFeatures.map(f => { const v=r[f]; return (typeof v!=='number'||isNaN(v))?0:v; }));
             if (features.length !== candles.length) throw new Error(`Hybrid combo alignment fail.`);
             mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
             if (mlPredictions.length !== candles.length) throw new Error(`Hybrid combo prediction count mismatch.`);
             console.log(`[ComboService] Hybrid combo prep complete.`);
        } else { // TA Combo Prep
             console.log(`[ComboService] TA combo prep: Fetching OHLCV data`);
             const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
             if (!data.candles?.length) throw new Error("Not enough market data for TA combo.");
             candles = data.candles;
             console.log(`[ComboService] TA combo prep complete.`);
        }

        // --- 2. Run Simulation for EACH Strategy (using Node.js sim) ---
        const individualResults = [];
        const riskParams = { riskManagementMode: comboConfig.riskManagementMode, riskPercentage: comboConfig.riskPercentage, growthCapitalTarget: comboConfig.growthCapitalTarget };

        for (const stratConfig of strategies) {
            const { code, params: stratParams } = stratConfig; // Per-strategy config
            if (!code) { console.warn("[ComboService] Skipping strategy in combo with missing 'code'."); continue; }

            const strategy = await Strategy.findOne({ userId, code }).lean();
            if (!strategy?.params?.strategyType) { console.warn(`[ComboService] Skipping: Strategy '${code}' not found or missing params.`); continue; }
            const strategyFunction = getStrategy(strategy.params.strategyType);
            if (!strategyFunction) { console.warn(`[ComboService] Skipping: Node.js function for '${strategy.params.strategyType}' not found.`); continue; }

            // Combine params: Global Combo -> Strategy Default -> Per-Strategy Instance
            const combinedParams = { ...globalComboParams, ...strategy.params, ...stratParams };
            const strategyName = strategy.name;

            console.log(`[ComboService] Simulating combo item in Node.js: ${strategyName} (${code})`);
            try {
                const { closedTrades, equityCurve } = runSimulation({ // Call Node.js simulation
                    candles, strategyFunction, strategyParams: combinedParams,
                    riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
                });
                const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve); // Call Node.js metrics
                individualResults.push({ strategyName, code, metrics, equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })) });
                console.log(`[ComboService] Simulation finished for ${strategyName}.`);
            } catch (simError) {
                console.error(`[ComboService] Simulation FAILED for strategy ${code}: ${simError.message}`);
                individualResults.push({ strategyName: `${strategyName} (Failed)`, code, metrics: calculateMetrics([], initialBalance, [{ timestamp: startDate, balance: initialBalance }]), equityCurve: [{ timestamp: startDate, balance: initialBalance }] });
            }
        } // End loop

        // --- 3. Aggregate Results ---
        const successfulRuns = individualResults.filter(r => !r.strategyName.includes('(Failed)'));
        const combinedMetrics = _aggregateMetrics(successfulRuns, initialBalance);
        const combinedEquityCurve = successfulRuns[0]?.equityCurve || [{ timestamp: startDate, balance: initialBalance }];

        const comboResult = {
            userId, symbol, timeframe, initialBalance, startDate, endDate, mlMode, mlModel, // Include combo config
            combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve, strategies: successfulRuns.map(r => r.strategyName) },
            individualResults: individualResults.map(r => ({ strategyName: r.strategyName, code: r.code, metrics: r.metrics })) // Don't send full equity curves for individuals by default
        };
        console.log(`[ComboService] Aggregation complete.`);

        // --- 4. Save/Return Combo Result ---
        if (!comboConfig.simulateOnly) { console.warn("[ComboService] Saving combo results to DB not implemented."); }
        return comboResult;

    } catch (error) {
        console.error(`[ComboService] Combo backtest failed: ${error.message}`); console.error(error.stack);
        throw new Error(`Combo Backtest Failed: ${error.message}`);
    }
};
