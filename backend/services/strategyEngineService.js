//backend/services/strategyEngineService.js


import { crossoverStrategy } from '../dbStructure/strategy.js'; // The pure calculation logic
 // A service to fetch price data

export const saveStrategyService = async (userId, strategyData) => {
  return Strategy.create({ userId, ...strategyData });
};

export const getStrategiesService = async (userId) => {
  return Strategy.find({ userId });
};

export const runStrategyService = async (userId, strategyId, pair, timeframe) => {
  // 1. Get the strategy's parameters from the database.
  const strategy = await Strategy.findById(strategyId);
  if (!strategy) throw new Error('Strategy not found.');
  if (strategy.userId.toString() !== userId) throw new Error('Not authorized.');

  // 2. Get the necessary market data.
  const ohlcv = await getMarketData(pair, timeframe);
  if (!ohlcv) throw new Error('Could not fetch market data.');

  // 3. Call the pure "engine" with the data and the saved parameters.
  const signal = crossoverStrategy(ohlcv, strategy.params);

  // 4. Return the result.
  return { signal, strategyName: strategy.name, pair, timeframe };
};
