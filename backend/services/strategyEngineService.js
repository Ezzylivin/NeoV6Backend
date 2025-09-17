// File: backend/services/strategyEngineService.js
// UPGRADED: Now correctly uses the strategyManager to run backtests.

import Strategy from "../dbStructure/strategy.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

export const saveStrategyService = async (userId, strategyData) => {
    return Strategy.create({ userId, ...strategyData });
};

export const getStrategiesService = async (userId) => {
    return Strategy.find({ userId }).select("_id name params").lean();
};

export const runStrategyService = async (userId, strategyId, pair, timeframe) => {
    // 1. Get the strategy's parameters from the database.
    const strategy = await Strategy.findById(strategyId);
    if (!strategy) throw new Error('Strategy not found.');
    if (strategy.userId.toString() !== userId) throw new Error('Not authorized.');

    // 2. Get the necessary market data.
    const { candles } = await fetchOHLCVMultiSafe(pair, timeframe);
    if (!candles) throw new Error('Could not fetch market data.');

    // 3. Get the correct strategy logic from the manager.
    const strategyFunction = getStrategy(strategy.params.strategyType);

    // 4. Call the pure "engine" with the data and the saved parameters.
    const trades = strategyFunction(candles, strategy.params);

    // 5. Return the result.
    return { trades, strategyName: strategy.name, pair, timeframe };
};
