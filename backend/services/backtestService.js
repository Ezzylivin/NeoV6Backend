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
           .
