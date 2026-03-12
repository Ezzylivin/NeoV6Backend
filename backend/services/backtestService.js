import Backtest from "../dbStructure/backtest.js";
import axios from "axios";
import https from "https";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

// --- CONFIGURATION ---
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const RESULTS_CACHE_DIR = path.resolve(process.cwd(), "python_data", "results");

/**
 * Generates a unique hash for caching based on the specific ML configuration.
 * If you change the model_type, a new cache file will be generated automatically.
 */
const generateCacheFilename = (config) => {
  const paramsKey = JSON.stringify(config);
  const hash = crypto.createHash("sha256").update(paramsKey).digest("hex");
  return `${config.symbol || "unknown"}_${config.timeframe || "unknown"}_${hash}.json`;
};

/**
 * PRIMARY BACKTEST SERVICE (NEO-V7 Upgraded)
 * Orchestrates calls to the Python Council of Experts.
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
  // 1. Parameter Handshake: Set intelligent defaults for the V7 Architecture
  const backtestConfig = {
    model_type: "stacking", // Default to the highest-conviction ensemble
    lookback: 50,           // Sync with Python ML_CONFIG
    ...config,              // Allow user-provided config to override defaults
  };

  const cacheFilename = generateCacheFilename(backtestConfig);
  const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);

  try {
    await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true });
    
    // Attempt to load from cache
    try {
      const cachedData = await fs.readFile(cacheFilePath, "utf-8");
      return JSON.parse(cachedData);
    } catch (e) {
      // If no cache, proceed to API call
    }

    // 2. Route Verification: Ensure this matches the FastAPI endpoint in api3.py
    const flaskUrl = `${ML_SERVER_URL}/api/backtest/run`;
    
    const response = await axios.post(flaskUrl, backtestConfig, {
      httpsAgent: httpsAgent,
      // 3. Timeout Adjustment: 20 minutes (1,200,000ms) 
      // Essential for processing the full Council (XGB + PFN + TFT)
      timeout: 1200000, 
    });

    const mlResult = response.data.combinedResult || response.data;

    if (!mlResult?.metrics || !mlResult?.equityCurve) {
      throw new Error("Invalid data structure from Python API.");
    }

    // Persist result to cache for future requests
    try {
      await fs.writeFile(cacheFilePath, JSON.stringify(mlResult, null, 2), "utf-8");
    } catch (cacheError) {
      console.warn("⚠️  Cache write failed, but returning results.");
    }

    return { ...backtestConfig, ...mlResult };

  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error("Backtest Timeout: The Council of Experts took too long to deliberate. Try a shorter date range.");
    }
    const msg = `Python Server API failed: ${error.message}`;
    throw new Error(error.response ? `${msg} (Status: ${error.response.status})` : msg);
  }
};

/**
 * COMBO STRATEGY SERVICE
 * Handles complex multi-asset backtests.
 */
export const runCombinedStrategyService = async (userId, comboConfig) => {
    const flaskUrl = `${ML_SERVER_URL}/api/backtest/combo`;

    try {
        // 🚀 CRITICAL: responseType 'stream' allows data to pass through bit by bit
        const response = await axios.post(flaskUrl, { ...comboConfig, userId }, {
            httpsAgent: httpsAgent,
            timeout: 1800000, 
            responseType: 'stream' 
        });

        // We return the raw stream directly to the controller
        return response.data; 

    } catch (apiError) {
        // Stream errors are handled differently; if it fails to even connect:
        const msg = `Python Server Connection Failed: ${apiError.message}`;
        throw new Error(msg);
    }
};
