// File: src/backend/services/backtestService.js

import Backtest from "../dbStructure/backtest.js";
import axios from "axios";
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';

// --- Configuration ---
// ✅ Ensure this points to your VPS Public IP
const ML_SERVER_URL = "http://74.208.28.77:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const RESULTS_CACHE_DIR = path.resolve(process.cwd(), 'python_data', 'results');

// --- HELPER: Generate Cache Filename ---
const generateCacheFilename = (config) => {
    const paramsKey = JSON.stringify({
        sym: config.symbol, tf: config.timeframe, sd: config.startDate, ed: config.endDate,
        mlMode: config.mlMode, mlm: config.mlModel, mlt: config.mlThreshold,
        code: config.code, 
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

/**
 * --- MASTER FUNCTION (Single Backtest) ---
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log(`[Service] Starting runBacktest. Mode: ${config.mlMode}. Forwarding to Python...`);
    
    // --- 1. Caching Logic ---
    const cacheFilename = generateCacheFilename(config);
    const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);
    
    try {
        await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true });
        try {
            const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
            console.log(`[Service] Cache HIT for ${cacheFilename}.`);
            const mlResult = JSON.parse(cachedData);
            return { ...config, ...mlResult, userId: config.userId };
        } catch (e) { /* Cache miss, ignore */ }
        
        // --- 2. CACHE MISS: Call Python Server ---
        console.log(`[Service] Cache MISS. Calling Python ML Server...`);
        const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`;
        let mlResult;

        try {
            const response = await axios.post(flaskUrl, config, { 
                httpsAgent: httpsAgent, 
                timeout: 600000 // 10 minutes
            });
            mlResult = response.data;

            if (!mlResult?.metrics || !mlResult?.equityCurve) {
                throw new Error("Invalid data structure from Python API.");
            }
        } catch (apiError) {
            let msg = `Python Server API call failed (${flaskUrl}): ${apiError.message}`;
            if (apiError.response) {
                console.error("🔥 [Service] Python Error Response:", JSON.stringify(apiError.response.data, null, 2));
                msg += ` Status: ${apiError.response.status}. Data: ${JSON.stringify(apiError.response.data)}`;
            }
            throw new Error(msg);
        }

        // --- 3. Save to Cache ---
        try { 
            await fs.writeFile(cacheFilePath, JSON.stringify(mlResult, null, 2), 'utf-8'); 
        } catch (saveError) { 
            console.error(`[Service] Warning: Cache save failed: ${saveError.message}`); 
        }

        // --- 4. PREPARE DATA FOR DB SAVE (CRITICAL FIX) ---
        const fullResult = {
            ...config,
            ...mlResult,
            userId: config.userId,
            
            // 💡 FIXED: Added 'type' to satisfy Mongoose Validation
            strategy: { 
                code: config.code, 
                name: config.params?.strategyType || config.code, 
                type: config.params?.strategyType || "Unknown", // <-- THIS WAS MISSING
                params: config.params || {} 
            },
            
            candlesTested: mlResult.candleData ? mlResult.candleData.length : 0
        };

        // Create a lighter version for DB saving
        const dataToSave = { ...fullResult };
        delete dataToSave.candleData; 
        delete dataToSave.mlPredictions; 

        if (!simulateOnly) { 
            console.log(`[Service] Saving NEW backtest to DB.`); 
            await Backtest.create(dataToSave);
        }
        
        return fullResult;

    } catch (error) {
        console.error(`[Service] Critical Error: ${error.message}`);
        throw error;
    }
};

/**
 * --- MASTER ORCHESTRATOR (Combo Backtest) ---
 */
export const runCombinedStrategyService = async (userId, comboConfig, authToken) => {
    console.log("[Service] Starting COMBO backtest...");
    
    const flaskUrl = `${ML_SERVER_URL}/api/ml/run-combo-backtest`;
    let comboApiResult;

    try {
        const response = await axios.post(flaskUrl, { ...comboConfig, userId }, {
            httpsAgent: httpsAgent, 
            timeout: 1800000 // 30 min
        });
        comboApiResult = response.data;

        if (!comboApiResult?.combinedResult) {
            throw new Error("Invalid combo data structure from Python API.");
        }
        
        return {
             userId,
             ...comboConfig,
             ...comboApiResult
         };

    } catch (apiError) {
        let msg = `Python Server COMBO API call failed: ${apiError.message}`;
        if (apiError.response) {
             console.error("🔥 [Service] Python Combo Error:", JSON.stringify(apiError.response.data, null, 2));
             msg += ` Status: ${apiError.response.status}`;
        }
        throw new Error(msg);
    }
};
