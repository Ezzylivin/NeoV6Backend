import Backtest from "../dbStructure/backtest.js";
import axios from "axios";
import https from "https";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

// --- Configuration ---
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const RESULTS_CACHE_DIR = path.resolve(process.cwd(), "python_data", "results");

// --- HELPER: Generate Cache Filename ---
const generateCacheFilename = (config) => {
  // Use all parameters explicitly, without ignoring any fields
  const paramsKey = JSON.stringify(config);
  console.log("[DEBUG: Cache Key Params]", paramsKey); // Log params to verify caching keys
  const hash = crypto.createHash("sha256").update(paramsKey).digest("hex");
  return `${config.symbol || "unknown"}_${config.timeframe || "unknown"}_${hash}.json`;
};

/**
 * --- MASTER FUNCTION (Single Backtest) ---
 */
export const runBacktest = async (config, authToken, simulateOnly = false) => {
  console.log("[DEBUG: Received Backtest Config]", JSON.stringify(config, null, 2)); // Log incoming backtest config

  const cacheFilename = generateCacheFilename(config);
  const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);

  try {
    await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true });

    // Remove caching temporarily for debugging
    const disableCache = false;
    if (!disableCache) {
      try {
        const cachedData = await fs.readFile(cacheFilePath, "utf-8");
        console.log(`[DEBUG: Cache HIT] Filename: ${cacheFilename}`);
        return JSON.parse(cachedData);
      } catch (e) {
        console.log("[DEBUG: Cache MISS]", cacheFilename);
      }
    }

    const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`;
    console.log("[DEBUG: Flask API URL]", flaskUrl); // Log the API endpoint

    const response = await axios.post(flaskUrl, config, {
      httpsAgent: httpsAgent,
      timeout: 600000,
    });

    const mlResult = response.data.combinedResult || response.data;
    console.log("[DEBUG: API Response]", mlResult); // Log raw API response

    if (!mlResult?.metrics || !mlResult?.equityCurve) {
      console.error("[DEBUG: Invalid Data Structure from Python API]", mlResult);
      throw new Error("Invalid data structure from Python API.");
    }

    // Save to cache
    try {
      await fs.writeFile(cacheFilePath, JSON.stringify(mlResult, null, 2), "utf-8");
      console.log("[DEBUG: Saved Results to Cache]");
    } catch (cacheError) {
      console.error("[DEBUG: Failed to Save Cache]", cacheError.message);
    }

    return { ...config, ...mlResult };
  } catch (error) {
    console.error("[DEBUG: Critical Error]", error.message);
    throw error;
  }
};
