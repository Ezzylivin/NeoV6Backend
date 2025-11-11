// File: backend/services/backtestService.js
//
// 💡 UPGRADE:
// 1. Configured to use HTTPS to match the Python server.
// 2. Pointed to port 8001.
// 3. Added `httpsAgent` to BOTH `axios.post` calls to fix SSL errors.

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import axios from "axios";
import https from 'https'; // <-- 1. This is correct
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';

// --- Configuration ---
// ✅ 2. FIXED: Use HTTPS and port 8001
const ML_SERVER_URL = "https://74.208.28.77:8001"; 
// ✅ 3. This is correct
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
        hybrid: config.params?.hybridMode,
        adx: config.params?.minAdxLevel ?? 'none',
        tsl: config.params?.tslAtrMult ?? 'none'
    });
    const hash = crypto.createHash('sha256').update(paramsKey).digest('hex');
    return `${hash}.json`;
};

// 🚀 --- formatApiResult function has been REMOVED --- 🚀

/**
 * --- MASTER FUNCTION (Single Backtest) ---
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
        console.log("✅ [Service] CACHE HIT. Returning (but not saving):", JSON.stringify(mlResult, null, 2));
        return { ...mlResult, userId: config.userId };
        
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[Service] Cache read error: ${error.message}. Forcing new run.`);
        }
        
        // --- 2. CACHE MISS: Call Python Server ---
        console.log(`[Service] Cache MISS. Calling Python ML Server...`);
        const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`;
        let mlResult;

        console.log("➡️ [Service] 1. CONFIG SENT TO PYTHON:", JSON.stringify(config, null, 2));
        
        try {
            console.log(`[Service] Posting config to ${flaskUrl}`);
            // ✅ 4. FIXED: Added httpsAgent
            const response = await axios.post(flaskUrl, config, { 
                httpsAgent: httpsAgent, 
                timeout: 600000 // 10 minute timeout for long backtests
            });
            mlResult = response.data;

            console.log("⬅️ [Service] 2. RAW RESPONSE FROM PYTHON (Success):", JSON.stringify(mlResult, null, 2));

            if (!mlResult?.metrics || !mlResult?.equityCurve) {
                throw new Error("Invalid data structure from Python API.");
            }
            console.log("[Service] Successfully received results from Python Server API.");
        
        } catch (apiError) { // Handle API call errors
            let msg = `Python Server API call failed (${flaskUrl}): ${apiError.message}`;
            if (apiError.response) {
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
        
        // --- 💡 START OF BSON 16MB LIMIT FIX ---
        const dataToSave = { ...resultFromPython };
        delete dataToSave.candleData; 
        delete dataToSave.mlPredictions;
        // --- 💡 END OF BSON 16MB LIMIT FIX ---

        console.log("💾 [Service] 3. FINAL OBJECT TO BE SAVED (small):", JSON.stringify(dataToSave, null, 2));

        if (!simulateOnly) { 
            console.log(`[Service] Saving NEW backtest to DB.`); 
            await Backtest.create(dataToSave);
        }
        
        console.log(`[Service] Returning NEW full result (with candleData) to frontend.`); 
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

    console.log("➡️ [Service] 1. COMBO CONFIG SENT TO PYTHON:", JSON.stringify({ ...comboConfig, userId }, null, 2));

    try {
        console.log(`[Service] Posting combo config to ${flaskUrl}`);
        
        // ✅ 5. FIXED: Added httpsAgent here as well
        const response = await axios.post(flaskUrl, { ...comboConfig, userId }, { // Add userId
            httpsAgent: httpsAgent, 
            timeout: 1800000 // 30 min timeout for complex combos
        });
        comboApiResult = response.data;

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
            console.error("🔥 [Service] 2. RAW COMBO RESPONSE FROM PYTHON (Failure):", JSON.stringify(apiError.response.data, null, 2));
            msg += ` Status: ${apiError.response.status}. Data: ${JSON.stringify(apiError.response.data)}`;
        }
        console.error(`[Service] ${msg}`); 
        throw new Error(msg);
    }
};
