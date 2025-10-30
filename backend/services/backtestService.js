// File: backend/services/backtestService.js
//
// UPGRADED:
// - All logic for 'off' and 'predictions' has been REMOVED.
// - This service now acts as a simple, dumb "proxy" to the Python ML server.
// - It passes ALL requests (on, off, predictions) to the Python server,
//   which now contains the logic for all 3 modes.

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import axios from "axios";
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';

// --- Configuration ---
const ML_SERVER_URL = "https://74.208.28.77:8001"; // URL for your Python server
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); // Allow self-signed cert
const RESULTS_CACHE_DIR = path.resolve(process.cwd(), 'python_data', 'results');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- HELPER: Generate Cache Filename (Used for caching ALL backtests) ---
const generateCacheFilename = (config) => {
    // Hash all config parameters to create a unique filename
    const paramsKey = JSON.stringify({
        sym: config.symbol, tf: config.timeframe, sd: config.startDate, ed: config.endDate,
        mlMode: config.mlMode, mlm: config.mlModel, mlt: config.mlThreshold,
        code: config.code, // TA Strategy code
        sl: config.params?.SL ?? 'none', tp: config.params?.TP ?? 'none',
        rm: config.riskManagementMode, rp: config.riskPercentage, gt: config.growthCapitalTarget,
        matr: config.params?.minAtrPct, tper: config.params?.trendFilterPeriod,
        hybrid: config.params?.hybridMode
    });
    const hash = crypto.createHash('sha256').update(paramsKey).digest('hex');
    return `${hash}.json`;
};

// --- Helper: Format API Result ---
const formatApiResult = (apiResult, config) => {
    // This helper formats the Python result for saving to the DB
    const { userId, symbol, timeframe, startDate, endDate, mlMode, mlModel, code } = config;
    const initialBalance = parseFloat(config.initialBalance);
    
    if (!apiResult?.metrics || !apiResult?.equityCurve) { 
        console.error("[Service] Invalid structure from ML API:", apiResult); 
        throw new Error("Invalid result structure from ML API."); 
    }
    
    let strategyName = "Unknown";
    if (mlMode === 'on') {
        strategyName = `ML: ${mlModel}`;
    } else if (mlMode === 'predictions') {
        strategyName = `Hybrid: ${code} + ${mlModel}`;
    } else {
        strategyName = `TA: ${code}`;
    }

    return {
        userId, symbol, timeframe, initialBalance,
        finalBalance: apiResult.metrics.finalBalance,
        profit: apiResult.metrics.finalBalance - initialBalance,
        totalTrades: apiResult.metrics.totalTrades,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        candlesTested: apiResult.equityCurve?.length || 0,
        strategy: {
            name: strategyName,
            type: mlMode,
            params: { ...config.params, mlThreshold: config.mlThreshold },
            mlModel: mlModel || null,
            taCode: code || null,
        },
        metrics: apiResult.metrics,
        equityCurve: apiResult.equityCurve.map(p => ({ timestamp: p.timestamp, balance: p.balance })),
        tradeHistory: (apiResult.trades || []).map(t => ({ 
            action: t.action, price: t.price, time: t.time, size: t.size, 
            pnl_pct: t.pnl_pct || 0, profit: t.profit_usd || 0, 
            entryTime: (t.action === 'buy' || t.action === 'sell_short') ? t.time : null, 
            exitTime: (t.action.startsWith('sell') || t.action === 'cover') ? t.time : null, 
            exitReason: (t.action.startsWith('sell') || t.action === 'cover') ? t.reason || t.action : null 
        })),
    };
};

/**
 * --- MASTER FUNCTION (Single Backtest) ---
 * This function now handles ALL modes (on, off, predictions)
 * by simply forwarding the request to the Python server.
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log(`[Service] Starting runBacktest. Mode: ${config.mlMode}. Forwarding to Python...`);
    
    // --- 1. Caching Logic (Identical for all modes) ---
    const cacheFilename = generateCacheFilename(config);
    const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);
    console.log(`[Service] Checking cache file: ${cacheFilePath}`);
    
    try {
        await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true }); // Ensure cache dir exists
        const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
        console.log(`[Service] Cache HIT for ${cacheFilename}.`);
        const mlResult = JSON.parse(cachedData);
        
        // Return formatted result (don't save to DB on cache hit)
        return formatApiResult(mlResult, config);
        
    } catch (error) {
        if (error.code !== 'ENOENT') {
             // This was an error reading the cache, not a miss
            console.error(`[Service] Cache read error: ${error.message}. Forcing new run.`);
        }
        
        // --- 2. CACHE MISS: Call Python Server ---
        console.log(`[Service] Cache MISS. Calling Python ML Server...`);
        const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`;
        let mlResult;
        
        try {
            console.log(`[Service] Posting config to ${flaskUrl}`);
            // Pass the *entire* config, Python will figure out the mode
            const response = await axios.post(flaskUrl, config, { 
                httpsAgent: httpsAgent, 
                timeout: 600000 // 10 minute timeout for long backtests
            });
            mlResult = response.data;
            if (!mlResult?.metrics || !mlResult?.equityCurve) {
                throw new Error("Invalid data structure from Python API.");
            }
            console.log("[Service] Successfully received results from Python Server API.");
        
        } catch (apiError) { // Handle API call errors
            let msg = `Python Server API call failed (${flaskUrl}): ${apiError.message}`;
            if (apiError.code === 'ECONNREFUSED' || apiError.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`;
            else if (apiError.response) msg += ` Status: ${apiError.response.status}. Data: ${JSON.stringify(apiError.response.data)}`;
            console.error(`[Service] ${msg}`); 
            throw new Error(msg);
        }

        // --- 3. Save to Cache ---
        try { 
            await fs.writeFile(cacheFilePath, JSON.stringify(mlResult, null, 2), 'utf-8'); 
            console.log(`[Service] Saved result to cache: ${cacheFilePath}`); 
        } catch (saveError) { 
            console.error(`[Service] WARNING: Failed to save to cache: ${saveError.message}`); 
        }

        // --- 4. Format & Return/Save ---
        const formattedResult = formatApiResult(mlResult, config);
        if (!simulateOnly) { 
            console.log(`[Service] Saving NEW backtest to DB.`); 
            return await Backtest.create(formattedResult); 
        }
        console.log(`[Service] Returning NEW simulation-only result.`); 
        return formattedResult;
    }
};

/**
 * --- MASTER ORCHESTRATOR (Combo Backtest) ---
 * 🚀 This is now also a proxy. We pass the *entire* combo config
 * to a new Python endpoint that will handle the combo logic.
 *
 * NOTE: This requires adding a '/api/ml/run-combo-backtest' endpoint
 * to your ml_server_api.py file.
 */
export const runCombinedStrategyService = async (userId, comboConfig, authToken) => {
    console.log("[Service] Starting COMBO backtest. Forwarding to Python...");
    
    // 🚀 We will send the *entire* combo config to Python
    // The Python server will be responsible for looping and aggregating.
    
    const flaskUrl = `${ML_SERVER_URL}/api/ml/run-combo-backtest`; // 🚀 NEW ENDPOINT
    let comboApiResult;

    try {
        console.log(`[Service] Posting combo config to ${flaskUrl}`);
        const response = await axios.post(flaskUrl, { ...comboConfig, userId }, { // Add userId
            httpsAgent: httpsAgent, 
            timeout: 1800000 // 30 min timeout for complex combos
        });
        comboApiResult = response.data;
        if (!comboApiResult?.combinedResult || !comboApiResult?.individualResults) {
            throw new Error("Invalid combo data structure from Python API.");
        }
        console.log("[Service] Successfully received combo results from Python Server API.");
        
        // The Python server should return the data pre-formatted
        // But we will format it just in case
        return {
             userId,
             ...comboConfig,
             ...comboApiResult // This should contain combinedResult, individualResults
         };

    } catch (apiError) {
        let msg = `Python Server COMBO API call failed (${flaskUrl}): ${apiError.message}`;
        if (apiError.code === 'ECONNREFUSED' || apiError.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`;
        else if (apiError.response) msg += ` Status: ${apiError.response.status}. Data: ${JSON.stringify(apiError.response.data)}`;
        console.error(`[Service] ${msg}`); 
        throw new Error(msg);
    }
};
