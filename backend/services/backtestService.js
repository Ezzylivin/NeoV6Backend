// File: backtest.js
// REAL BACKTEST ENGINE
// UPDATED: Supports a clean backtesting flow

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";

// --- Utility for metrics ---
const calculateMetrics = (trades, initialBalance = 1000) => {
    if (!trades || trades.length === 0) return {};
    let equity = 0, equityCurve = [], wins = 0, losses = 0, totalProfit = 0, maxDrawdown = 0, peak = 0;

    trades.forEach((trade) => {
        equity += trade.profit || 0;
        equityCurve.push({ timestamp: trade.timestamp || trade.entryTimestamp, balance: initialBalance + equity });
        if (equity > peak) peak = equity;
        else { const dd = peak - equity; if (dd > maxDrawdown) maxDrawdown = dd; }
        if (trade.profit > 0) wins++; else losses++;
        totalProfit += trade.profit || 0;
    });

    const winRate = trades.length ? wins / trades.length : 0;

    return { totalProfit, totalTrades: trades.length, winRate, maxDrawdown, equityCurve, tradeHistory: trades };
};

// --- Run single backtest ---
export const runBacktest = async ({ userId, code, symbol, timeframe, startDate, endDate, tp, sl, simulateOnly = true }) => {
    // 1. Lookup strategy
    const strategy = await Strategy.findOne({ userId, code });
    if (!strategy) throw new Error("Strategy not found.");

    // 2. Fetch market data
    const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);
    if (!candles) throw new Error("Could not fetch market data.");

    // 3. Get strategy function
    const strategyFunction = getStrategy(strategy.params.strategyType);

    // 4. Run strategy
    const trades = strategyFunction(candles, strategy.params);

    // 5. Calculate metrics
    const metrics = calculateMetrics(trades, strategy.params.initialBalance || 1000);
    const finalBalance = (strategy.params.initialBalance || 1000) + (metrics.totalProfit || 0);

    // 6. Prepare backtest object
    const backtestData = {
        userId,
        symbol, // FIX: Use 'symbol' instead of 'pair' for consistency
        timeframe,
        initialBalance: strategy.params.initialBalance || 1000,
        finalBalance,
        startDate,
        endDate,
        takeProfit: tp,
        stopLoss: sl,
        candlesTested: candles.length,
        strategy: {
            name: strategy.name,
            type: strategy.params.strategyType,
            parameters: strategy.params,
            code: strategy.code
        },
        tradeBreakdown: trades,
        equityCurve: metrics.equityCurve,
        metrics
    };

    // 7. Save backtest if not in simulateOnly mode
    if (!simulateOnly) {
        const savedBacktest = await Backtest.create(backtestData);
        return savedBacktest;
    }

    // 8. Return preview data
    return backtestData;
};
