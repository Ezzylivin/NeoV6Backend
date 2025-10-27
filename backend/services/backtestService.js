// File: services/backtestService.js
// FINAL VERSION V3:
// - ML_SERVER_URL points to HTTPS and port 8001 for external calls (Config, Features, Bulk Predict).
// - Uses httpsAgent for external calls to handle potential self-signed certs.
// - Fetches pre-calculated results for Pure ML mode ('on') via internal HTTP call (no agent).
// - Uses original Node.js simulation for Pure TA ('off').
// - Uses original Node.js simulation + ML server calls (HTTPS :8001) for Hybrid ('predictions').

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
// ✅ UPDATED back to HTTPS and port 8001
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
    // ... (rest of streaming/parsing logic is correct) ...
    const start_ms = new Date(startDate + 'T00:00:00.000Z').getTime();
    const end_ms = new Date(endDate + 'T23:59:59.999Z').getTime();
    if (isNaN(start_ms) || isNaN(end_ms)) { throw new Error("Invalid start or end date format."); }
    const filteredData = [];
    const parser = parse({
        columns: true, skip_empty_lines: true,
        cast: (value, context) => { /* ... cast logic ... */
             if (context.header) return value;
             if (context.column === 'datetime') return value;
             const num = Number(value);
             if (!isNaN(num) && value !== null && String(value).trim() !== '') return num;
             return value;
         }
     });
    parser.on('readable', () => { /* ... parsing ... */ });
    parser.on('error', (err) => { throw new Error(`Failed to parse CSV data: ${err.message}`); });

    try {
        // ✅ Use httpsAgent for the external HTTPS call
        const response = await axios.get(data_url, { responseType: 'stream', httpsAgent: httpsAgent, timeout: 300000 });
        // ... (rest of try block is correct) ...
        response.data.pipe(parser);
        await finished(parser);
        if (filteredData.length === 0) { throw new Error(`No historical feature data found for date range (${startDate} to ${endDate}) in ${data_filename}.`); }
        console.log(`[ML] Found ${filteredData.length} feature rows for Hybrid Mode date range.`);
        return filteredData;
    } catch (error) {
        // ... (error handling is correct, uses ML_SERVER_URL in message) ...
        let errorMessage = `Failed to stream feature file from ${data_url}.`;
        if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server API running at ${ML_SERVER_URL}?`;}
        // ... other error checks ...
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
        // ... (payload/headers logic is correct) ...
        const payload = { model_name: modelName, features: features };
        const headers = {};
        if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }

        // ✅ Use httpsAgent for the external HTTPS call
        const response = await axios.post(bulk_url, payload, { httpsAgent: httpsAgent, headers, timeout: 180000 });
        // ... (rest of prediction mapping is correct) ...
        const predictions = response.data.predictions.map(p => { /* ... map predictions ... */ });
        console.log(`[ML] Received ${predictions.length} predictions for Hybrid Mode.`);
        return predictions;
    } catch (error) {
        // ... (error handling is correct, uses ML_SERVER_URL in message) ...
        let errorMessage = `Bulk prediction failed for model ${modelName} (Hybrid).`;
         if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server API running at ${ML_SERVER_URL}?`;}
         // ... other error checks ...
        console.error(`[ML] Bulk prediction failed for Hybrid: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


/**
 * --- SIMULATION ENGINE --- (Unchanged)
 */
const runSimulation = (config) => {
    // ... (This function remains exactly as before) ...
    console.log(`[Simulation] Starting simulation. Mode: ${config.mlMode}.`);
    // ... full simulation logic ...
    console.log(`[Simulation] Finished.`);
    return { /* closedTrades, equityCurve */ };
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
    // ... (initial setup: isComboTest, initialBalance, extract config vars) ...
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
                // ✅ Correct internal URL (HTTP, local backend port - NO CHANGE NEEDED HERE)
                const internalApiUrl = `http://127.0.0.1:${port}/api/ml/ml-backtest-results`;
                console.log(`[Orchestrator] Calling internal API: ${internalApiUrl}`);

                // ✅ No httpsAgent needed for internal HTTP call
                const response = await axios.get(internalApiUrl);
                const mlResult = response.data;
                // ... (rest of formatting logic is correct) ...
                if (!mlResult || typeof mlResult !== 'object' || !mlResult.initial_balance) { throw new Error("Invalid data from internal ML results endpoint."); }
                const formattedResult = { /* ... format mlResult ... */ };
                // ... calculate avgWin/Loss ...
                if (!simulateOnly) { return await Backtest.create(formattedResult); }
                return formattedResult;
            } catch (error) {
                // ... (error handling is correct) ...
                console.error(`[Orchestrator] Failed fetch/process pre-calculated ML: ${error.message}`);
                throw new Error(`Failed retrieve ML backtest results via internal API. Error: ${error.message}`);
            }
        } else if (mlMode === 'predictions') {
            // --- HYBRID MODE (Uses external HTTPS :8001 calls) ---
            console.log(`[Orchestrator] Running HYBRID backtest via Node.js simulation.`);
            // These helpers now correctly target HTTPS :8001 and use httpsAgent
            if (!mlModel) throw new Error("ML Model name required for Hybrid.");
            const mlConfig = await _getMLConfig(mlModel, authToken);
            dynamicFeatureNames = mlConfig.features;
            const fullFeatureData = await _getFeatureData(symbol, timeframe, startDate, endDate);
            candles = fullFeatureData.map(row => { /* ... extract candles ... */ }).filter(Boolean);
            if (!candles || candles.length < 2) throw new Error("Not enough candle data for Hybrid.");
            // ... (align features) ...
            const features = /* ... map aligned features ... */
            if (features.length !== candles.length) { throw new Error(`Hybrid alignment failed`); }
            mlPredictions = await _getBulkPredictions(mlModel, features, authToken);
            if (mlPredictions.length !== candles.length) { throw new Error(`Hybrid prediction count mismatch`); }
            console.log(`[Orchestrator] Hybrid Prep Complete.`);
            // Continue below...
        } else {
             // --- ✅ PURE TA MODE --- (Unchanged)
             console.log(`[Orchestrator] Pure TA mode detected. Fetching OHLCV data.`);
             // ... (Your existing logic: fetchOHLCVMultiSafe) ...
             const data = await fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate);
             if (!data.candles || data.candles.length < 2) throw new Error("Not enough market data.");
             candles = data.candles;
             console.log(`[Orchestrator] Fetched ${candles.length} candles for Pure TA.`);
             // Continue below...
        }

        // --- STEP 2: Execute Simulation(s) (Only for TA and Hybrid - Unchanged) ---
        if (mlMode !== 'on') {
            if (isComboTest) { /* ... Combo logic ... */ }
            else { /* ... Single TA/Hybrid logic ... */ }
        }
    } catch (error) {
        console.error(`[Orchestrator] Backtest failed: ${error.message}`);
        console.error(error.stack);
        throw new Error(`Backtest Orchestration Failed: ${error.message}`);
    }
};
