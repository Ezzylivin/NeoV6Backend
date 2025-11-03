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

// 🚀 --- formatApiResult function has been REMOVED --- 🚀
// The Python server is now the source of truth for formatting.

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
        
        // 🚀 DEBUG LOG
        console.log("✅ [Service] CACHE HIT. Returning (but not saving):", JSON.stringify(mlResult, null, 2));

        // Return the cached result directly.
        return { ...mlResult, userId: config.userId };
        
    } catch (error) {
        if (error.code !== 'ENOENT') {
             // This was an error reading the cache, not a miss
            console.error(`[Service] Cache read error: ${error.message}. Forcing new run.`);
        }
        
        // --- 2. CACHE MISS: Call Python Server ---
        console.log(`[Service] Cache MISS. Calling Python ML Server...`);
        const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`;
        let mlResult;

        // 🚀 DEBUG LOG 1: What are we sending to Python?
        console.log("➡️ [Service] 1. CONFIG SENT TO PYTHON:", JSON.stringify(config, null, 2));
        
        try {
            console.log(`[Service] Posting config to ${flaskUrl}`);
            // Pass the *entire* config, Python will figure out the mode
            const response = await axios.post(flaskUrl, config, { 
                httpsAgent: httpsAgent, 
                timeout: 600000 // 10 minute timeout for long backtests
            });
            mlResult = response.data;

            // 🚀 DEBUG LOG 2: What did we get back from Python?
            console.log("⬅️ [Service] 2. RAW RESPONSE FROM PYTHON (Success):", JSON.stringify(mlResult, null, 2));

            if (!mlResult?.metrics || !mlResult?.equityCurve) {
                throw new Error("Invalid data structure from Python API.");
            }
            console.log("[Service] Successfully received results from Python Server API.");
        
        } catch (apiError) { // Handle API call errors
            let msg = `Python Server API call failed (${flaskUrl}): ${apiError.message}`;
            if (apiError.response) {
                // 🚀 DEBUG LOG 2.5 (Error): What did Python send on failure?
                console.error("🔥 [Service] 2. RAW RESPONSE FROM PYTHON (Failure):", JSON.stringify(apiError.response.data, null, 2));
                msg += ` Status: ${apiError.response.status}. Data: ${JSON.stringify(apiError.response.data)}`;
            }
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

        // --- 4. Return/Save (True Proxy Logic) ---
        const resultFromPython = { ...mlResult, userId: config.userId };

        // 🚀 DEBUG LOG 3: What are we trying to save to the database?
        console.log("💾 [Service] 3. FINAL OBJECT TO BE SAVED:", JSON.stringify(resultFromPython, null, 2));

        if (!simulateOnly) { 
            console.log(`[Service] Saving NEW backtest to DB.`); 
            // This is where the Mongoose validation error happens
            return await Backtest.create(resultFromPython); 
        }
        console.log(`[Service] Returning NEW simulation-only result.`); 
        return resultFromPython;
    }
};

/**
 * --- MASTER ORCHESTRATOR (Combo Backtest) ---
 */
export const runCombinedStrategyService = async (userId, comboConfig, authToken) => {
    console.log("[Service] Starting COMBO backtest. Forwarding to Python...");
    
    const flaskUrl = `${ML_SERVER_URL}/api/ml/run-combo-backtest`;
    let comboApiResult;

    // 🚀 DEBUG LOG (COMBO)
    console.log("➡️ [Service] 1. COMBO CONFIG SENT TO PYTHON:", JSON.stringify({ ...comboConfig, userId }, null, 2));

    try {
        console.log(`[Service] Posting combo config to ${flaskUrl}`);
        const response = await axios.post(flaskUrl, { ...comboConfig, userId }, { // Add userId
            httpsAgent: httpsAgent, 
            timeout: 1800000 // 30 min timeout for complex combos
        });
        comboApiResult = response.data;

        // 🚀 DEBUG LOG (COMBO)
        console.log("⬅️ [Service] 2. RAW COMBO RESPONSE FROM PYTHON (Success):", JSON.stringify(comboApiResult, null, 2));

        if (!comboApiResult?.combinedResult || !comboApiResult?.individualResults) {
            throw new Error("Invalid combo data structure from Python API.");
        }
        console.log("[Service] Successfully received combo results from Python Server API.");
        
        return {
             userId,
             ...comboApiResult // This should contain combinedResult, individualResults
         };

    } catch (apiError) {
        let msg = `Python Server COMBO API call failed (${flaskUrl}): ${apiError.message}`;
        if (apiError.response) {
            // 🚀 DEBUG LOG (COMBO)
            console.error("🔥 [Service] 2. RAW COMBO RESPONSE FROM PYTHON (Failure):", JSON.stringify(apiError.response.data, null, 2));
            msg += ` Status: ${apiError.response.status}. Data: ${JSON.stringify(apiError.response.data)}`;
        }
        console.error(`[Service] ${msg}`); 
        throw new Error(msg);
    }
};
