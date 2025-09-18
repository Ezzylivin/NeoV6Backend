// File: services/strategyEngineService.js
// MERGED: Strategy runner + optional full backtest saving
// UPDATED: Fully supports 'code' for strategy lookup

import Strategy from "../dbStructure/strategy.js";
import Backtest from "../dbStructure/backtest.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// --- Utility: calculate metrics ---
const calculateMetrics = (trades, initialBalance = 1000) => {
    if (!trades || trades.length === 0) return {};
    let equity = 0, equityCurve = [], wins = 0, losses = 0, totalProfit = 0, maxDrawdown = 0, peak = 0;
    trades.forEach(trade => {
        equity += trade.profit || 0;
        equityCurve.push({ timestamp: trade.timestamp, balance: initialBalance + equity });
        if (equity > peak) peak = equity;
        else { const dd = peak - equity; if (dd > maxDrawdown) maxDrawdown = dd; }
        if (trade.profit > 0) wins++; else losses++;
        totalProfit += trade.profit || 0;
    });
    const winRate = trades.length ? wins / trades.length : 0;
    return { totalProfit, totalTrades: trades.length, winRate, maxDrawdown, equityCurve, tradeHistory: trades };
};

// --- Save a new strategy ---
export const saveStrategyService = async (userId, strategyData) => {
    return Strategy.create({ userId, ...strategyData });
};

// --- Get all strategies for a user ---
export const getStrategiesService = async (userId) => {
    return Strategy.find({ userId }).select("_id name code params").lean();
};

// --- Run strategy (single) ---
export const runStrategyService = async (dbStrategy, params = {}, userId, simulateOnly = true) => {
    if (!dbStrategy) throw new Error("Strategy object is required.");
    if (dbStrategy.userId.toString() !== userId.toString()) throw new Error("Not authorized.");

    const { pair, timeframe, startDate, endDate, tp, sl } = params;

   // FIX: A single, robust fetch function for OHLCV data
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
  const key = `${symbol}::${timeframe}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const exchanges = ['coinbase', 'kraken', 'gemini'];

  for (const exchangeId of exchanges) {
    console.log(`[CandleService] Trying US exchange: ${exchangeId}`);
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000 });

    // FIX: Correctly handle different US symbol formats
    const symbolFormats = [
      symbol.includes('/') ? symbol : `${symbol.slice(0, -3)}/${symbol.slice(-3)}`,
      symbol.replace('/', '-')
    ];

    for (const format of symbolFormats) {
      const candles = await fetchCandlesWithRetry(exchange, format, timeframe);
      if (candles) {
        const result = { candles };
        cache.set(key, { ts: Date.now(), value: result });
        return result;
      }
    }
  }

  throw new Error(`Failed to fetch candle data for ${symbol} from all available US exchanges.`);
}


    // 2. Get strategy logic
    const strategyFunction = getStrategy(dbStrategy.params.strategyType);

    // 3. Run strategy
    const trades = strategyFunction(candles, dbStrategy.params);

    // 4. Calculate metrics
    const metrics = calculateMetrics(trades, dbStrategy.params.initialBalance || 1000);
    const finalBalance = (dbStrategy.params.initialBalance || 1000) + (metrics.totalProfit || 0);

    // 5. Save backtest if not simulateOnly
    if (!simulateOnly) {
        const backtestData = {
            userId,
            symbol: pair,
            timeframe,
            initialBalance: dbStrategy.params.initialBalance || 1000,
            finalBalance,
            startDate: startDate || new Date(candles[0][0]),
            endDate: endDate || new Date(candles[candles.length - 1][0]),
            takeProfit: tp,
            stopLoss: sl,
            candlesTested: candles.length, // FIX: Added candles tested metric
            strategy: {
                name: dbStrategy.name,
                type: dbStrategy.params.strategyType,
                parameters: dbStrategy.params,
                code: dbStrategy.code
            },
            tradeBreakdown: trades,
            equityCurve: metrics.equityCurve,
            metrics
        };
        const savedBacktest = await Backtest.create(backtestData);
        return savedBacktest;
    }

    // 6. Return preview
    return { trades, metrics, strategyName: dbStrategy.name, pair, timeframe, code: dbStrategy.code };
};

// --- Run batch backtests ---
export const runBatchBacktestsService = async (dbStrategy, batchParams, userId) => {
    const results = [];
    for (const params of batchParams) {
        const res = await runStrategyService(dbStrategy, params, userId, false);
        results.push(res);
    }
    return results;
};

// --- Wrapper for preview mode ---
export const runBacktestService = async (dbStrategy, params, userId, previewOnly = true) => {
    return runStrategyService(dbStrategy, params, userId, !previewOnly);
};
