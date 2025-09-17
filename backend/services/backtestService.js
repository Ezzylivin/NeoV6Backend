// REAL BACKTEST ENGINE
// UPDATED: Supports strategyCode lookup for single & batch backtests

import Backtest from "../dbStructure/backtest.js";
import Strategy from "../dbStructure/strategy.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";

// --- Utility for metrics ---
const calculateMetrics = (trades) => {
    if (!trades || trades.length === 0) return {};
    let equity = 0, equityCurve = [], wins = 0, losses = 0, totalProfit = 0, maxDrawdown = 0, peak = 0;

    trades.forEach((trade) => {
        equity += trade.profit || 0;
        equityCurve.push({ timestamp: trade.timestamp || trade.entryTimestamp, balance: equity });
        if (equity > peak) peak = equity;
        else { const dd = peak - equity; if (dd > maxDrawdown) maxDrawdown = dd; }
        if (trade.profit > 0) wins++; else losses++;
        totalProfit += trade.profit || 0;
    });

    const winRate = trades.length ? wins / trades.length : 0;

    return { totalProfit, totalTrades: trades.length, winRate, maxDrawdown, equityCurve, tradeHistory: trades };
};

// --- Run single backtest ---
export const runBacktest = async ({ userId, code, symbol, timeframe, startDate, endDate, tp, sl, simulateOnly }) => {
    // 1. Lookup strategy
    const strategy = await Strategy.findOne({ userId, code });
    if (!strategy) throw new Error("Strategy not found.");

    // 2. Fetch market data
    const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);

    // 3. Get strategy function
    const strategyFunction = getStrategy(strategy.params.strategyType);

    // 4. Run strategy
    const trades = strategyFunction(candles, strategy.params);

    // 5. Calculate metrics
    const metrics = calculateMetrics(trades);
    const finalBalance = strategy.params.initialBalance + (metrics.totalProfit || 0);

    // 6. Prepare backtest object
    const backtestData = {
        userId,
        symbol,
        timeframe,
        initialBalance: strategy.params.initialBalance,
        finalBalance,
        startDate,
        endDate,
        takeProfit: tp ?? strategy.params.takeProfit,
        stopLoss: sl ?? strategy.params.stopLoss,
        strategy: {
            name: strategy.name,
            type: strategy.params.strategyType,
            parameters: strategy.params,
            code: strategy.code
        },
        tradeBreakdown: trades.map(trade => ({
            entryTime: trade.entryTimestamp || trade.timestamp,
            exitTime: trade.exitTimestamp || null,
            entryPrice: trade.entryPrice || 0,
            exitPrice: trade.exitPrice || 0,
            position: trade.position || 'long',
            size: trade.size || 1,
            profit: trade.profit || 0,
            commission: trade.commission || 0,
            exitCommission: trade.exitCommission || 0,
            duration: trade.duration || null,
            result: trade.result || 'open'
        })),
        equityCurve: metrics.equityCurve.map(pt => ({ timestamp: pt.timestamp, balance: pt.balance })),
        metrics
    };

    if (!simulateOnly) {
        return await Backtest.create(backtestData);
    }

    return backtestData;
};

// --- Run batch backtests ---
export const runBatchBacktests = async (userId, configs) => {
    const results = [];
    const batchConfigs = configs.slice(0, 50); // Limit batch size

    for (const cfg of batchConfigs) {
        try {
            const res = await runBacktest({ userId, ...cfg });
            results.push({ success: true, result: res });
        } catch (error) {
            console.error("[Batch Backtest Error]", error.message);
            results.push({ success: false, error: error.message, config: cfg });
        }
    }

    return results;
};
