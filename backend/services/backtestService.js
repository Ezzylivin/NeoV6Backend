// File: backend/services/backtestService.js
// UPGRADED: A real backtesting engine using live data and a strategy manager.

import Backtest from "../dbStructure/backtest.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";

// --- Utility for metrics (Unchanged) ---
const calculateMetrics = (trades) => {
    if (!trades || trades.length === 0) return {};
    let equity = 0,
        equityCurve = [],
        wins = 0,
        losses = 0,
        totalProfit = 0,
        maxDrawdown = 0,
        peak = 0;

    trades.forEach((trade) => {
        equity += trade.profit || 0;
        equityCurve.push({ time: trade.timestamp || trade.entryTimestamp, equity });
        if (equity > peak) peak = equity;
        else {
            const dd = peak - equity;
            if (dd > maxDrawdown) maxDrawdown = dd;
        }
        if (trade.profit > 0) wins++;
        else losses++;
        totalProfit += trade.profit || 0;
    });

    const winRate = trades.length ? wins / trades.length : 0;

    return {
        totalProfit,
        totalTrades: trades.length,
        winRate,
        maxDrawdown,
        equityCurve,
        tradeHistory: trades
    };
};

// --- Run single backtest ---
export const runBacktest = async ({ userId, strategy, symbol, timeframe, startDate, endDate, tp, sl, simulateOnly }) => {
    // 1. Fetch market data
    const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);

    // 2. Get strategy function
    const strategyFunction = getStrategy(strategy.params.strategyType);

    // 3. Run strategy to generate trades
    const trades = strategyFunction(candles, strategy.params);

    // 4. Calculate metrics & equity curve
    const metrics = calculateMetrics(trades);
    const finalBalance = strategy.params.initialBalance + (metrics.totalProfit || 0);

    // 5. Prepare backtest object for MongoDB
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
            parameters: strategy.params
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
        equityCurve: metrics.equityCurve.map(pt => ({ timestamp: pt.time, balance: pt.equity })),
        metrics
    };

    // 6. Save to MongoDB or return if simulateOnly
    if (!simulateOnly) {
        const saved = await Backtest.create(backtestData);
        return saved;
    }

    return backtestData;
};

// --- Run batch backtests ---
export const runBatchBacktests = async (userId, configs) => {
    const results = [];
    // Limit batch to 50 configs to avoid overloading DB or exchange
    const batchConfigs = configs.slice(0, 50);

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
