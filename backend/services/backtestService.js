// File: backend/services/backtestService.js
import Price from "../dbStructure/price.js";
import Backtest from "../dbStructure/backtest.js";
import { fetchOHLCV } from "./marketDataService.js";
import { logToDb } from "./logService.js";

/**
 * -----------------------------
 * DEFAULT STRATEGY PARAMETERS
 * -----------------------------
 */
export const DEFAULT_STRATEGY_PARAMS = {
  SMA: { short: 10, long: 50 },
  EMA: { short: 12, long: 26 },
  RSI: { period: 14, oversold: 30, overbought: 70 },
  MACD: { fast: 12, slow: 26, signal: 9 },
  BOLLINGERBANDS: { period: 20, multiplier: 2 },
  STOCHASTIC: { k: 14 },
  VWAP: { period: 20 },
  ATR: { period: 14 }
};

// Only U.S.-friendly exchanges
const EXCHANGES = ["coinbase", "kraken", "gemini"];

/**
 * -----------------------------
 * RUN SINGLE BACKTEST
 * -----------------------------
 */
export const runBacktest = async ({
  userId,
  symbol,
  timeframe = "1h",
  initialBalance = 1000,
  strategy = { name: "SMA", parameters: {} },
  risk = "Medium",
  takeProfit = null,
  stopLoss = null,
  limit = 2000,
  startDate,
  endDate,
  tradeConfig = {}
} = {}) => {
  if (!userId || !symbol) throw new Error("Missing required fields");

  let candles = [];

  // Try each U.S. exchange until we get data
  for (const ex of EXCHANGES) {
    try {
      candles = await fetchOHLCV(ex, symbol, timeframe, limit, startDate, endDate);
      if (candles.length) break;
    } catch (err) {
      console.warn(`[BacktestService] Failed fetching ${symbol} from ${ex}: ${err.message}`);
    }
  }

  if (!candles.length) throw new Error(`No candles found for ${symbol} on any U.S. exchange`);

  // -----------------------------
  // Placeholder for strategy logic
  // -----------------------------
  const finalBalance = initialBalance; // TODO: implement actual strategy logic
  const trades = [];

  const saved = await Backtest.create({
    userId,
    symbol,
    timeframe,
    strategyName: strategy?.name || "Custom",
    parameters: strategy?.parameters || {},
    risk,
    initialBalance,
    finalBalance,
    trades,
    takeProfit,
    stopLoss,
    startDate,
    endDate,
    tradeConfig
  });

  await logToDb(userId, `[Backtest] ${symbol} | ${timeframe} | Risk: ${risk} | Profit: $${(finalBalance - initialBalance).toFixed(2)}`);

  return saved.toObject();
};

/**
 * -----------------------------
 * RUN BATCH BACKTESTS
 * -----------------------------
 */
export const runBatchBacktests = async (userId, strategyId, paramCombos) => {
  const results = [];
  for (const combo of paramCombos) {
    const result = await runBacktest({ userId, strategyId, ...combo });
    results.push(result);
  }
  return results;
};

/**
 * Alias for bot service to maintain backward compatibility
 */
export const runRealisticBacktest = runBacktest;
