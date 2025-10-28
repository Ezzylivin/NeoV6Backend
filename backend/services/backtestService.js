// File: backend/services/backtestService.js
// Final Version: Strict separation - API call for mlMode='on'

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
// spawn is no longer needed in this file for the final architecture
// import { spawn } from 'child_process';
import fs from 'fs/promises';
import crypto from 'crypto';

// --- Configuration ---
const ML_SERVER_URL = "https://74.208.28.77:8001"; // Used for Hybrid AND ML 'on'
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); // Used for Hybrid AND ML 'on'
const RESULTS_CACHE_DIR = path.resolve(process.cwd(), 'python_data', 'results'); // Cache dir for ML 'on' mode

// --- HELPER: Generate Cache Filename (Used for caching ML 'on' API results) ---
const generateCacheFilename = (config) => {
    // Include all parameters that affect the Python script's outcome
    const paramsKey = JSON.stringify({
        sym: config.symbol, tf: config.timeframe, sd: config.startDate, ed: config.endDate,
        mlm: config.mlModel, mlt: config.mlThreshold,
        sl: config.params?.SL ?? 'none', tp: config.params?.TP ?? 'none',
        rm: config.riskManagementMode, rp: config.riskPercentage, gt: config.growthCapitalTarget,
        matr: config.params?.minAtrPct, tper: config.params?.trendFilterPeriod
    });
    const hash = crypto.createHash('sha256').update(paramsKey).digest('hex');
    return `${hash}.json`;
};

// --- Helper Functions for HYBRID Mode (External Server - mlMode='predictions') ---
const _getMLConfig = async (modelName, authToken) => {
    const config_url = `${ML_SERVER_URL}/api/ml/config/${modelName}`;
    console.log(`[Hybrid] Fetching config: ${config_url}`);
    const headers = {}; if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }
    try {
        const response = await axios.get(config_url, { httpsAgent: httpsAgent, headers, timeout: 15000 });
        if (!response.data?.features?.length) { throw new Error("Invalid config format from ML server."); }
        console.log(`[Hybrid] Got ${response.data.features.length} features.`);
        return response.data;
    } catch (error) {
        let msg = `ML config fetch failed: ${error.message}`;
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`;
        else if (error.response) msg += ` Status: ${error.response.status}. ${JSON.stringify(error.response.data)}`;
        console.error(`[Hybrid] ${msg}`); throw new Error(msg);
    }
};
const _getFeatureData = async (symbol, timeframe, startDate, endDate) => {
    const data_filename = `${symbol.replace('/', '')}-${timeframe}-features.csv`;
    const data_url = `${ML_SERVER_URL}/data/${data_filename}`;
    console.log(`[Hybrid] Streaming features: ${data_url}`);
    const start_ms = new Date(startDate + 'T00:00:00.000Z').getTime();
    const end_ms = new Date(endDate + 'T23:59:59.999Z').getTime();
    if (isNaN(start_ms) || isNaN(end_ms)) throw new Error("Invalid date.");
    const filteredData = [];
    const parser = parse({ columns: true, skip_empty_lines: true, cast: (v, c) => { if (c.header || c.column === 'datetime') return v; const n = Number(v); return (!isNaN(n) && v !== null && String(v).trim() !== '') ? n : v; } });
    parser.on('readable', () => { let r; while ((r = parser.read()) !== null) { const row_ms = new Date(r.datetime).getTime(); if (!isNaN(row_ms) && row_ms >= start_ms && row_ms <= end_ms) { Object.keys(r).forEach(k => { if (k !== 'datetime' && typeof r[k] === 'string') { const n = Number(r[k]); if (!isNaN(n) && r[k].trim() !== '') r[k] = n; } }); filteredData.push(r); } } });
    parser.on('error', (err) => { throw new Error(`CSV stream parse error: ${err.message}`); });
    try {
        const response = await axios.get(data_url, { responseType: 'stream', httpsAgent: httpsAgent, timeout: 300000 });
        response.data.pipe(parser);
        await finished(parser);
        if (filteredData.length === 0) { throw new Error(`No feature data found for range in ${data_filename}.`); }
        console.log(`[Hybrid] Found ${filteredData.length} rows.`);
        return filteredData;
    } catch (error) {
        let msg = `Feature stream failed: ${error.message}`;
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`;
        else if (error.response) msg += ` Status: ${error.response.status}. ${JSON.stringify(error.response.data)}`;
        console.error(`[Hybrid] ${msg}`); throw new Error(msg);
    }
};
const _getBulkPredictions = async (modelName, features, authToken) => {
    const bulk_url = `${ML_SERVER_URL}/api/ml/predict_bulk`;
    console.log(`[Hybrid] Getting ${features.length} bulk predictions...`);
    try {
        const payload = { model_name: modelName, features: features };
        const headers = {}; if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const response = await axios.post(bulk_url, payload, { httpsAgent: httpsAgent, headers, timeout: 180000 });
        const preds = response.data.predictions.map(p => (typeof p === 'number') ? { prediction: p, probability: 1.0 } : (p?.prediction !== undefined && p?.probability !== undefined) ? p : { prediction: 0, probability: 0.0 });
        console.log(`[Hybrid] Got ${preds.length} predictions.`);
        return preds;
    } catch (error) {
        let msg = `Bulk prediction failed: ${error.message}`;
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`;
        else if (error.response) msg += ` Status: ${error.response.status}. ${JSON.stringify(error.response.data)}`;
        console.error(`[Hybrid] ${msg}`); throw new Error(msg);
    }
};

// --- Helper Functions for Node.js Simulation (TA / Hybrid / Combo) ---
// 🚀 Replace these stubs with your actual Node.js simulation and metrics logic
const runSimulation = (config) => {
    const { candles } = config; if (!candles || candles.length === 0) return { closedTrades: [], equityCurve: [{ timestamp: Date.now(), balance: config.initialBalance }] };
    console.log(`[NodeSim] Starting simulation. Mode: ${config.mlMode}. Candles: ${candles.length}. (Stubbed - Needs Implementation!)`);
    // [YOUR FULL NODE.JS SIMULATION LOGIC HERE for TA and Hybrid]
    // This function needs to loop through candles, call strategyFunction, apply ML predictions if hybrid, handle risk, execute trades, and build equity curve.
    const mockEquity = [{ timestamp: config.candles[0]?.[0], balance: config.initialBalance }, { timestamp: config.candles[config.candles.length-1]?.[0], balance: config.initialBalance * (1 + (Math.random() - 0.4) * 0.5) }];
    return { closedTrades: [], equityCurve: mockEquity }; // Placeholder
};
const calculateMetrics = (trades, initialBalance, equityCurve) => {
    const finalBalance = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].balance : initialBalance; const totalProfit = finalBalance - initialBalance; const totalReturn = (totalProfit / initialBalance) * 100;
    console.log(`[NodeSim] Calculated metrics. (Stubbed - Needs Implementation!)`);
    // [YOUR FULL NODE.JS METRICS CALCULATION LOGIC HERE]
    return { initialBalance, finalBalance, totalProfit, totalReturn, totalTrades: trades.length, winningTrades: 0, losingTrades: 0, winRate: 0, averageWin: 0, averageLoss: 0, profitFactor: null, maxDrawdown: Math.random() * 20 }; // Placeholder
};
const _aggregateMetrics = (individualResults, initialBalance) => {
    // [YOUR FULL NODE.JS COMBO METRICS AGGREGATION LOGIC HERE]
    console.log(`[NodeSim] Aggregating ${individualResults.length} results. (Stubbed - Needs Implementation!)`);
    if (individualResults.length > 0) return individualResults[0].metrics; // Simplistic placeholder
    return calculateMetrics([], initialBalance, [{ timestamp: Date.now(), balance: initialBalance }]); // Placeholder
};

// --- Helper: Format API Result (Used for ML 'on' results from API) ---
const formatApiResult = (apiResult, config) => {
     const { userId, symbol, timeframe, startDate, endDate, mlMode, mlModel } = config;
     const initialBalance = parseFloat(config.initialBalance);
     if (!apiResult?.metrics || !apiResult?.equityCurve) { console.error("[Service] Invalid structure from ML API:", apiResult); throw new Error("Invalid result structure from ML API."); }
     return {
         userId, symbol, timeframe, initialBalance, finalBalance: apiResult.metrics.finalBalance, profit: apiResult.metrics.finalBalance - initialBalance, totalTrades: apiResult.metrics.totalTrades, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), candlesTested: apiResult.equityCurve?.length || 0,
         strategy: { name: `ML API: ${mlModel}`, type: 'ml', params: { ...config.params, mlThreshold: config.mlThreshold }, mlModel: mlModel, taCode: null },
         metrics: apiResult.metrics, equityCurve: apiResult.equityCurve.map(p => ({ timestamp: p.timestamp, balance: p.balance })), // Assume timestamp is ISO string
         tradeHistory: (apiResult.trades || []).map(t => ({ action: t.action, price: t.price, time: t.time, size: t.size, pnl_pct: t.pnl_pct || 0, profit: t.profit_usd || 0, entryTime: t.action === 'buy' ? t.time : null, exitTime: t.action.startsWith('sell') ? t.time : null, exitReason: t.action.startsWith('sell') ? t.reason || t.action : null })),
     };
};

/**
 * --- MASTER FUNCTION (Single Backtest - Strict Separation - API for ML 'on') ---
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log(`[Service] Starting runBacktest. Mode: ${config.mlMode}`);
    const { userId, symbol, timeframe, startDate, endDate, mlMode = 'off', mlModel, mlThreshold, code } = config; // code is TA strategy code
    const initialBalance = parseFloat(config.initialBalance || 1000);
    const globalParams = config.params || {};

    try {
        // --- BRANCH 1: Pure ML ('on') -> Use ML Server API Call ---
        if (mlMode === 'on') {
            console.log(`[Service] Running Pure ML via ML Server API for model: ${mlModel}`);
            if (!mlModel) throw new Error("ML Model name required for 'on' mode.");

            // --- Caching Logic ---
            const cacheFilename = generateCacheFilename(config);
            const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);
            console.log(`[Service] Checking cache file: ${cacheFilePath}`);
            try {
                await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true }); // Ensure cache dir exists
                const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
                console.log(`[Service] Cache HIT for ${cacheFilename}.`);
                const mlResult = JSON.parse(cachedData);
                const formattedResult = formatApiResult(mlResult, config);
                // Decide if cache hits should also save to DB (optional)
                // if (!simulateOnly && some_condition) { await Backtest.create(formattedResult); }
                return formattedResult; // Return cached result
            } catch (error) {
                if (error.code === 'ENOENT') { // Cache Miss
                    console.log(`[Service] Cache MISS. Calling ML Server API...`);
                    const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`;
                    let mlResult;
                    try {
                        console.log(`[Service] Posting config to ${flaskUrl}`);
                        const response = await axios.post(flaskUrl, config, { httpsAgent: httpsAgent, timeout: 300000 }); // 5 min timeout
                        mlResult = response.data;
                        if (!mlResult?.metrics || !mlResult?.equityCurve) throw new Error("Invalid data structure from ML API.");
                        console.log("[Service] Successfully received results from ML Server API.");
                    } catch (apiError) { // Handle API call errors specifically
                        let msg = `ML Server API call failed (${flaskUrl}): ${apiError.message}`;
                        if (apiError.code === 'ECONNREFUSED' || apiError.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`;
                        else if (apiError.response) msg += ` Status: ${apiError.response.status}. Data: ${JSON.stringify(apiError.response.data)}`;
                        console.error(`[Service] ${msg}`); throw new Error(msg);
                    }
                    // --- Save to Cache ---
                    try { await fs.writeFile(cacheFilePath, JSON.stringify(mlResult, null, 2), 'utf-8'); console.log(`[Service] Saved result to cache: ${cacheFilePath}`); }
                    catch (saveError) { console.error(`[Service] WARNING: Failed to save to cache: ${saveError.message}`); }
                    // --- Format & Return/Save ---
                    const formattedResult = formatApiResult(mlResult, config);
                    if (!simulateOnly) { console.log(`[Service] Saving NEW ML backtest to DB.`); return await Backtest.create(formattedResult); }
                    console.log(`[Service] Returning NEW simulation-only ML result.`); return formattedResult;
                } else { throw new Error(`Cache read error: ${error.message}`); } // Other cache errors
            } // End Caching Logic

        }
        // --- BRANCH 2: TA ('off') or Hybrid ('predictions') -> Use Node.js Simulation ---
        else {
            console.log(`[Service] Running ${mlMode === 'predictions' ? 'Hybrid' : 'TA'} via Node.js simulation.`);
            let candles, mlPredictions = null;
            const riskParams = { riskManagementMode: config.riskManagementMode, riskPercentage: config.riskPercentage, growthCapitalTarget: config.growthCapitalTarget };

            // --- Prep Data for Node.js Simulation ---
            if (mlMode === 'predictions') { // Hybrid Prep (External Server)
                if (!mlModel || !code) throw new Error("ML Model and TA Code required for Hybrid.");
                console.log(`[Service] Hybrid Prep: Fetching external data/preds for ${mlModel}`);
                const mlConfig = await _getMLConfig(mlModel, authToken); const dynFeatures = mlConfig.features;
                const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);
                candles = fullFeatureData.map(r=>{const t=new Date(r.datetime).getTime(),o=Number(r.open),h=Number(r.high),l=Number(r.low),c=Number(r.close); return [t,o,h,l,c];}).filter(c=>!c.some(isNaN));
                if (!candles?.length) throw new Error("No valid candle data for Hybrid.");
                const validTs = new Set(candles.map(c => c[0])); const alignedFeat = fullFeatureData.filter(r => validTs.has(new Date(r.datetime).getTime()));
                const features = alignedFeat.map(r => dynFeatures.map(f => { const v=r[f]; return (typeof v!=='number'||isNaN(v))?0:v; }));
                if(features.length !== candles.length) throw new Error(`Hybrid align fail.`);
                mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
                if(mlPredictions.length !== candles.length) throw new Error(`Hybrid pred count mismatch.`);
                console.log(`[Service] Hybrid Prep Complete.`);
            } else { // TA Prep (Local Fetch)
                if (!code) throw new Error("Strategy 'code' required for TA Only ('off').");
                console.log(`[Service] TA Prep: Fetching OHLCV data`);
                const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
                if (!data.candles?.length) throw new Error("Not enough market data for TA.");
                candles = data.candles;
                console.log(`[Service] TA Prep Complete.`);
            }

            // --- Get Node.js Strategy Function ---
            const strategy = await Strategy.findOne({ userId, code }).lean(); // Find the TA strategy definition
            if (!strategy?.params?.strategyType) throw new Error(`TA Strategy '${code}' not found or missing params.`);
            const strategyFunction = getStrategy(strategy.params.strategyType); // Get the corresponding JS function
            if (!strategyFunction) throw new Error(`Node.js function for TA type '${strategy.params.strategyType}' not found.`);
            const strategyParams = { ...globalParams, ...strategy.params, ...config.params }; // Combine global, default, and specific params
            const strategyName = mlMode === 'predictions' ? `Hybrid: ${strategy.name} + ${mlModel}` : strategy.name;

            // --- Execute Node.js Simulation ---
            console.log(`[Service] Running Node.js simulation for: ${strategyName}`);
            // 🚀 Ensure your runSimulation function correctly uses all these inputs
            const { closedTrades, equityCurve } = runSimulation({
                candles, strategyFunction, strategyParams,
                riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
            });
            // 🚀 Ensure your calculateMetrics function correctly uses these inputs
            const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);

            // --- Format & Save/Return ---
            const backtestData = {
                userId, symbol, timeframe, initialBalance, finalBalance: metrics.finalBalance, profit: metrics.totalProfit, totalTrades: metrics.totalTrades, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), candlesTested: candles.length,
                strategy: { name: strategyName, type: mlMode, params: strategyParams, mlModel: mlMode === 'predictions' ? mlModel : null, taCode: code },
                metrics, equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })),
                // 🚀 Map your actual Node.js trade structure here correctly
                tradeHistory: closedTrades.map(t => ({ action: t?.side || 'N/A', price: t?.entryPrice || 0, time: t?.entryTime || '', size: t?.size || 0, pnl_pct: t?.pnlPerc || 0, profit: t?.profit || 0, entryTime: t?.entryTime || '', exitTime: t?.exitTime || '', exitReason: t?.exitReason || '' })),
            };
            if (!simulateOnly) { console.log(`[Service] Saving ${mlMode} backtest to DB via Node.js.`); return await Backtest.create(backtestData); }
            console.log(`[Service] Returning simulation-only ${mlMode} result via Node.js.`); return backtestData;
        } // End TA / Hybrid Logic

    } catch (error) {
        console.error(`[Service] Backtest failed: ${error.message}`);
        console.error(error.stack); // Log full stack trace
        throw new Error(`Backtest Failed: ${error.message}`); // Re-throw for controller
    }
};

/**
 * --- MASTER ORCHESTRATOR (Combo Backtest - Uses Node Simulation) ---
 * Runs multiple simulations based on the combo config using Node.js engine.
 */
export const runCombinedStrategyService = async (userId, comboConfig, authToken) => {
    console.log("[Service] Starting COMBO backtest (Node.js Simulation) with config:", comboConfig);
    const { strategies, symbol, timeframe, startDate, endDate, mlMode, mlModel, mlThreshold } = comboConfig;
    const initialBalance = parseFloat(comboConfig.initialBalance || 1000);
    const globalComboParams = comboConfig.params || {};

    let candles, mlPredictions = null; // Data needed for Node.js sim

    try {
        // --- 1. Prepare Data (Once for Node.js sim) ---
        if (mlMode === 'predictions') { // Hybrid Combo Prep (External Server)
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
        } else { // TA Combo Prep (Local Fetch)
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
            const { code, params: stratParams } = stratConfig;
            if (!code) { console.warn("[ComboService] Skipping strategy in combo with missing 'code'."); continue; }

            const strategy = await Strategy.findOne({ userId, code }).lean();
            if (!strategy?.params?.strategyType) { console.warn(`[ComboService] Skipping: Strategy '${code}' not found or missing params.`); continue; }
            const strategyFunction = getStrategy(strategy.params.strategyType); // Get JS func
            if (!strategyFunction) { console.warn(`[ComboService] Skipping: Node.js function for '${strategy.params.strategyType}' not found.`); continue; }
            const combinedParams = { ...globalComboParams, ...strategy.params, ...stratParams }; // Combine params
            const strategyName = strategy.name;

            console.log(`[ComboService] Simulating combo item in Node.js: ${strategyName} (${code})`);
            try {
                // Call Node.js simulation for each leg
                // 🚀 Ensure your runSimulation function handles these inputs correctly
                const { closedTrades, equityCurve } = runSimulation({
                    candles, strategyFunction, strategyParams: combinedParams,
                    riskParams, initialBalance, mlMode, mlPredictions, mlThreshold
                });
                // 🚀 Ensure your calculateMetrics function handles these inputs correctly
                const metrics = calculateMetrics(closedTrades, initialBalance, equityCurve);
                individualResults.push({ strategyName, code, metrics, equityCurve: equityCurve.map(p => ({ timestamp: typeof p.timestamp === 'number' ? new Date(p.timestamp).toISOString() : p.timestamp, balance: p.balance })) });
                console.log(`[ComboService] Simulation finished for ${strategyName}.`);
            } catch (simError) {
                console.error(`[ComboService] Simulation FAILED for strategy ${code}: ${simError.message}`);
                // Add dummy result for failed strategy
                individualResults.push({ strategyName: `${strategyName} (Failed)`, code, metrics: calculateMetrics([], initialBalance, [{ timestamp: startDate, balance: initialBalance }]), equityCurve: [{ timestamp: startDate, balance: initialBalance }] });
            }
        } // End loop

        // --- 3. Aggregate Results ---
        const successfulRuns = individualResults.filter(r => !r.strategyName.includes('(Failed)'));
        // 🚀 Ensure your _aggregateMetrics function correctly combines results
        const combinedMetrics = _aggregateMetrics(successfulRuns, initialBalance); // Node.js aggregation
        // Use first successful curve as combined (simplistic) - adjust if needed
        const combinedEquityCurve = successfulRuns[0]?.equityCurve || [{ timestamp: startDate, balance: initialBalance }];

        const comboResult = {
            userId, symbol, timeframe, initialBalance, startDate, endDate, mlMode, mlModel, // Include combo config
            combinedResult: { metrics: combinedMetrics, equityCurve: combinedEquityCurve, strategies: successfulRuns.map(r => r.strategyName) },
            individualResults: individualResults.map(r => ({ strategyName: r.strategyName, code: r.code, metrics: r.metrics })) // Exclude individual curves by default
        };
        console.log(`[ComboService] Aggregation complete.`);

        // --- 4. Save/Return Combo Result ---
        // Combo results typically aren't saved to the main Backtest collection
        if (!comboConfig.simulateOnly) { console.warn("[ComboService] Saving combo results to DB not implemented."); }
        return comboResult; // Return the aggregated + individual results

    } catch (error) {
        console.error(`[ComboService] Combo backtest failed: ${error.message}`); console.error(error.stack);
        throw new Error(`Combo Backtest Failed: ${error.message}`);
    }
};
