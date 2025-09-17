// File: backend/services/backtestService.js
// UPGRADED: A real backtesting engine using live data and a strategy manager.

import Backtest from "../dbStructure/backtest.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";
import { getStrategy } from "../strategies/strategyManager.js";

// --- Utility for metrics (Unchanged) ---
const calculateMetrics = (trades) => {
    if (!trades || trades.length === 0) return {};
    let equity = 0, equityCurve = [], wins = 0, losses = 0, totalProfit = 0, maxDrawdown = 0, peak = 0;
    trades.forEach((trade) => {
        equity += trade.profit;
        equityCurve.push({ time: trade.timestamp, equity });
        if (equity > peak) peak = equity;
        else { const dd = peak - equity; if (dd > maxDrawdown) maxDrawdown = dd; }
        if (trade.profit > 0) wins++; else losses++;
        totalProfit += trade.profit;
    });
    const winRate = trades.length ? wins / trades.length : 0;
    return { totalProfit, totalTrades: trades.length, winRate, maxDrawdown, equityCurve, tradeHistory: trades };
};

// --- Run single backtest ---
export const runBacktest = async ({ userId, strategy, symbol, timeframe, startDate, endDate, tp, sl, simulateOnly }) => {
    // 1. Fetch real market data from the data service
    const { candles } = await fetchOHLCVMultiSafe(symbol, timeframe);
    
    // 2. Get the correct strategy logic from the manager
    // Assumes strategy object has params like { strategyType: 'RSI', rsiPeriod: 14, ... }
    const strategyFunction = getStrategy(strategy.params.strategyType);
    
    // 3. Run the strategy on the data to generate trades
    const trades = strategyFunction(candles, strategy.params);

    // 4. Calculate metrics from the generated trades
    const metrics = calculateMetrics(trades);

    // 5. Save to DB or return result
    if (!simulateOnly) {
        const saved = await Backtest.create({
            userId, strategyName: strategy.name, symbol, timeframe,
            startDate, endDate, tp, sl, trades, metrics
        });
        return saved;
    }

    return { strategyName: strategy.name, symbol, timeframe, startDate, endDate, tp, sl, metrics };
};

// --- Run batch backtests ---
export const runBatchBacktests = async (userId, configs) => {
    const results = [];
    for (const cfg of configs.slice(0, 50)) {
        const res = await runBacktest({ userId, ...cfg });
        results.push(res);
    }
    return results;
};
