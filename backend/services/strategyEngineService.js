// MERGED: Strategy runner + optional full backtest saving
// UPDATED: Fully supports strategyCode

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
    return Strategy.find({ userId }).select("_id name strategyCode params").lean();
};

// --- Run a strategy with optional full backtest ---
export const runStrategyService = async ({ userId, strategyCode, pair, timeframe, startDate, endDate, tp, sl, simulateOnly = true }) => {
    // 1. Get strategy parameters using strategyCode
    const strategy = await Strategy.findOne({ userId, strategyCode });
    if (!strategy) throw new Error("Strategy not found.");
    if (strategy.userId.toString() !== userId) throw new Error("Not authorized.");

    // 2. Fetch market data
    const { candles } = await fetchOHLCVMultiSafe(pair, timeframe);
    if (!candles) throw new Error("Could not fetch market data.");

    // 3. Get strategy logic
    const strategyFunction = getStrategy(strategy.params.strategyType);

    // 4. Run strategy
    const trades = strategyFunction(candles, strategy.params);

    // 5. Calculate metrics
    const metrics = calculateMetrics(trades, strategy.params.initialBalance || 1000);

    // 6. If simulateOnly is false, save a full backtest
    if (!simulateOnly) {
        const savedBacktest = await Backtest.create({
            userId,
            strategyName: strategy.name,
            symbol: pair,
            timeframe,
            startDate: startDate || new Date(candles[0][0]),
            endDate: endDate || new Date(candles[candles.length - 1][0]),
            tp,
            sl,
            trades,
            metrics,
            initialBalance: strategy.params.initialBalance || 1000,
            strategy: {
                name: strategy.name,
                type: strategy.params.strategyType,
                parameters: strategy.params,
                strategyCode: strategy.strategyCode
            }
        });
        return savedBacktest;
    }

    // 7. Return preview result if simulateOnly
    return { trades, metrics, strategyName: strategy.name, pair, timeframe, strategyCode: strategy.strategyCode };
};
