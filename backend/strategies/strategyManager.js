// File: backend/strategies/strategyManager.js
import { smaCrossoverStrategy } from './smaCrossover.js';
import { rsiStrategy } from './rsi.js';
import { macdStrategy } from './macd.js';
import { bollingerBandsStrategy } from './bollingerBands.js';
import { stochasticStrategy } from './stochastic.js';

const strategies = {
  'SMA': smaCrossoverStrategy,
  'RSI': rsiStrategy,
  'MACD': macdStrategy,
  'BBANDS': bollingerBandsStrategy,
  'STOCH': stochasticStrategy,
};

export const getStrategy = (strategyType) => {
  const strategy = strategies[strategyType.toUpperCase()];
  if (!strategy) {
    throw new Error(`Strategy type '${strategyType}' is not supported.`);
  }
  return strategy;
};
