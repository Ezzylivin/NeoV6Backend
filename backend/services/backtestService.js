// File: src/backend/services/backtestService.js

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
// --- HELPER: Generate Cache Filename ---
const generateCacheFilename = (config) => {
    // 🟢 FIX: Ensure we pick up dates regardless of camelCase or snake_case
    const startDate = config.startDate || config.start_date || 'default_start';
    const endDate = config.endDate || config.end_date || 'default_end';

    const paramsKey = JSON.stringify({
        sym: config.symbol, 
        tf: config.timeframe, 
        sd: startDate, 
        ed: endDate,
        mlMode: config.mlMode, 
        mlm: config.mlModel, 
        mlt: config.mlThreshold,
        code: config.code, 
        rm: config.riskManagementMode, 
        rp: config.riskPercentage, 
        gt: config.growthCapitalTarget,
        // Include everything that affects the result
        params: config.params || {}
    });
    
    const hash = crypto.createHash('sha256').update(paramsKey).digest('hex');
    return `${config.symbol}_${config.timeframe}_${hash}.json`;
};

export const runBacktest = async (config, authToken, simulateOnly = false) => {
    console.log(`[Service] Starting runBacktest for ${config.symbol}. Dates: ${config.startDate} to ${config.endDate}`);
    
    // 1. Generate path
    const cacheFilename = generateCacheFilename(config);
    const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);
    
    try {
        await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true });
        
        // 🟢 FIX: During debugging, you can comment out this try/catch block 
        // to force a fresh run and bypass the cache entirely.
        try {
            const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
            console.log(`[Service] ✅ Cache HIT: ${cacheFilename}`);
            return { ...config, ...JSON.parse(cachedData), userId: config.userId };
        } catch (e) { 
            console.log(`[Service] ❌ Cache MISS: Running fresh backtest...`);
        }
        
        // 2. Call Python
        const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`; 
        
        const response = await axios.post(flaskUrl, config, { 
            httpsAgent: httpsAgent, 
            timeout: 600000 
        });

        let mlResult = response.data.combinedResult || response.data;

        
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

        // 🔍 DEBUG LOG: See exactly what Python sent back
        console.log("🔍 [DEBUG] Python Raw Response (Keys):", Object.keys(rawData));
        if (rawData.combinedResult) {
             console.log("🔍 [DEBUG] combinedResult Keys:", Object.keys(rawData.combinedResult));
             console.log("🔍 [DEBUG] Metrics Sample:", JSON.stringify(rawData.combinedResult.metrics, null, 2));
        }

        // 1. Unwrap
        const innerResult = rawData.combinedResult || rawData;

        if (!innerResult?.metrics || !innerResult?.equityCurve) {
            console.error("🔥 Invalid Data. Received full object:", JSON.stringify(rawData).substring(0, 500));
            throw new Error("Invalid combo data structure from Python API.");
        }
        
        // 2. Flatten for Frontend
        const finalResponse = {
             userId,
             ...comboConfig,
             // Lift these to the top level
             metrics: innerResult.metrics, 
             equityCurve: innerResult.equityCurve,
             trades: innerResult.trades,
             // Keep original for safety
             combinedResult: innerResult 
         };

         console.log("✅ [DEBUG] Sending to Controller. Metrics ROI:", finalResponse.metrics?.roi);
         return finalResponse;

    } catch (apiError) {
        let msg = `Python Server COMBO API call failed: ${apiError.message}`;
        if (apiError.response) {
             console.error("🔥 [Service] Python Error Data:", JSON.stringify(apiError.response.data, null, 2));
             msg += ` Status: ${apiError.response.status}`;
        }
        throw new Error(msg);
    }
};
