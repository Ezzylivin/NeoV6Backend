import Backtest from "../dbStructure/backtest.js";
import axios from "axios";
import https from "https";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const RESULTS_CACHE_DIR = path.resolve(process.cwd(), "python_data", "results");

const generateCacheFilename = (config) => {
  const paramsKey = JSON.stringify(config);
  const hash = crypto.createHash("sha256").update(paramsKey).digest("hex");
  return `${config.symbol || "unknown"}_${config.timeframe || "unknown"}_${hash}.json`;
};

export const runBacktest = async (config, authToken, simulateOnly = false) => {
  const cacheFilename = generateCacheFilename(config);
  const cacheFilePath = path.join(RESULTS_CACHE_DIR, cacheFilename);

  try {
    await fs.mkdir(RESULTS_CACHE_DIR, { recursive: true });
    const disableCache = false;
    if (!disableCache) {
      try {
        const cachedData = await fs.readFile(cacheFilePath, "utf-8");
        return JSON.parse(cachedData);
      } catch (e) {}
    }

    const flaskUrl = `${ML_SERVER_URL}/api/ml/run-backtest-on`;
    const response = await axios.post(flaskUrl, config, {
      httpsAgent: httpsAgent,
      timeout: 600000,
    });

    const mlResult = response.data.combinedResult || response.data;

    if (!mlResult?.metrics || !mlResult?.equityCurve) {
      throw new Error("Invalid data structure from Python API.");
    }

    try {
      await fs.writeFile(cacheFilePath, JSON.stringify(mlResult, null, 2), "utf-8");
    } catch (cacheError) {}

    return { ...config, ...mlResult };
  } catch (error) {
    throw error;
  }
};

export const runCombinedStrategyService = async (userId, comboConfig, authToken) => {
  const flaskUrl = `${ML_SERVER_URL}/api/backtest/combo`;

  try {
    const response = await axios.post(flaskUrl, { ...comboConfig, userId }, {
      httpsAgent: httpsAgent,
      timeout: 1800000,
    });

    const rawData = response.data;
    const innerResult = rawData.combinedResult || rawData;

    if (!innerResult?.metrics || !innerResult?.equityCurve) {
      throw new Error("Invalid combo data structure from Python API.");
    }

    return {
      userId,
      ...comboConfig,
      metrics: innerResult.metrics,
      equityCurve: innerResult.equityCurve,
      trades: innerResult.trades,
      combinedResult: innerResult,
    };
  } catch (apiError) {
    const msg = `Python Server COMBO API failed: ${apiError.message}`;
    if (apiError.response) {
      throw new Error(`${msg} Status: ${apiError.response.status}`);
    }
    throw new Error(msg);
  }
};
