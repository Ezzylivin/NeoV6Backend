import Backtest from "../dbStructure/backtest.js";
import axios from "axios";
import https from 'https';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

// --- Configuration ---
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const RESULTS_CACHE_DIR = path.resolve(process.cwd(), 'python_data', 'results');

// --- HELPER: Generate Cache Filename ---
const generateCacheFilename = (config) => {
    // Use all parameters explicitly without normalizing names or relying on dependents
    const paramsKey = JSON.stringify(config);  // Entire config is now hashed for uniqueness
    
    const hash = crypto.createHash('sha256').update(paramsKey).digest('hex');
    // Construct filename using symbol and timeframe for debugging while using the unique hash
    return [
        config.symbol || 'symbol-unknown',
        config.timeframe || 'time-unknown',
        hash
    ].join('_') + ".json";
};

/**
 * --- MASTER FUNCTION (Single Backtest) ---
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log(`[Service] Starting runBacktest for ${config.symbol}. Dates: ${config.startDate} to ${config.endDate}`);
    
    const cacheFilename = generateCacheFilename(config);
    const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);
    
    try {
        await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true });
        
        // Try to load from cache
        try {
            const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
            console.log(`[Service] ✅ Cache HIT: ${cacheFilename}`);
            const mlResult = JSON.parse(cachedData);
            return { ...config, ...mlResult, userId: config.userId };
        } catch (e) { 
            console.log(`[Service] ❌ Cache MISS: Running fresh backtest...`);
        }
        
        const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`; 
        
        const response = await axios.post(flaskUrl, config, { 
            httpsAgent: httpsAgent, 
            timeout: 600000 
        });

        let mlResult = response.data.combinedResult || response.data;

        if (!mlResult?.metrics || !mlResult?.equityCurve) {
            throw new Error("Invalid data structure from Python API.");
        }

        // Save to Cache
        try { 
            await fs.writeFile(cacheFilePath, JSON.stringify(mlResult, null, 2), 'utf-8'); 
        } catch (saveError) { 
            console.error(`[Service] Cache save failed: ${saveError.message}`); 
        }

        // Prepare for DB
        const fullResult = {
            ...config,
            ...mlResult,
            userId: config.userId,
            strategy: { 
                code: config.code, 
                name: config.params?.strategyType || config.code, 
                params: config.params || {} 
            },
            candlesTested: mlResult.candleData ? mlResult.candleData.length : 0
        };

        const dataToSave = { ...fullResult };
        delete dataToSave.candleData; 
        delete dataToSave.mlPredictions; 

        if (!simulateOnly) { 
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
    
    const flaskUrl = `${ML_SERVER_URL}/api/backtest/combo`;

    try {
        const response = await axios.post(flaskUrl, { ...comboConfig, userId }, {
            httpsAgent: httpsAgent, 
            timeout: 1800000 
        });
        
        const rawData = response.data;
        const innerResult = rawData.combinedResult || rawData;

        if (!innerResult?.metrics || !innerResult?.equityCurve) {
            console.error("🔥 Invalid Data structure from Python.");
            throw new Error("Invalid combo data structure from Python API.");
        }
        
        // Flatten for Frontend compatibility
        return {
             userId,
             ...comboConfig,
             metrics: innerResult.metrics, 
             equityCurve: innerResult.equityCurve,
             trades: innerResult.trades,
             combinedResult: innerResult 
         };

    } catch (apiError) {
        let msg = `Python Server COMBO API failed: ${apiError.message}`;
        if (apiError.response) {
             console.error("🔥 [Service] Python Error Data:", JSON.stringify(apiError.response.data));
             msg += ` Status: ${apiError.response.status}`;
        }
        throw new Error(msg);
    }
};
