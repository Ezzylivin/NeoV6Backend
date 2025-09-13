// File: backend/strategies/strategyManager.js
import { smaCrossoverStrategy } from './smaCrossover.js';
import { rsiStrategy } from './rsi.js';

const strategies = {
  'SMA': smaCrossoverStrategy,
  'RSI': rsiStrategy,
  // EMA can use the same logic as SMA Crossover
  'EMA': smaCrossoverStrategy, 
};

export const getStrategy = (strategyType) => {
  const strategy = strategies[strategyType.toUpperCase()];
  if (!strategy) {
    throw new Error(`Strategy type '${strategyType}' is not supported.`);
  }
  return strategy;
};
