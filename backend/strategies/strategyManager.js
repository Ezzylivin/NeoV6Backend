// File: backend/strategies/strategyManager.js
// UPGRADED: Now correctly imports and maps all strategy functions.

import { smaCrossoverStrategy } from './smaCrossoverStrategy.js';
import { rsiStrategy } from './rsiStrategy.js';
import { macdStrategy } from './macdStrategy.js';
import { bollingerBandsStrategy } from './bollingerBandsStrategy.js';
import { stochasticStrategy } from './stochasticStrategy.js';
import { parabolicSarStrategy } from './parabolicSarStrategy.js';
import { obvStrategy } from './obvStrategy.js';
import { cciStrategy } from './cciStrategy.js';
import { atrStrategy } from './atrStrategy.js';
import { ichimokuStrategy } from './ichimokuStrategy.js';

// This 'strategies' object maps the human-readable strategy name
// to the actual JavaScript function that contains the trading logic.
const strategies = {
  'Moving Average Crossover': smaCrossoverStrategy,
  'RSI': rsiStrategy,
  'MACD': macdStrategy,
  'Bollinger Bands': bollingerBandsStrategy,
  'Stochastic Oscillator': stochasticStrategy,
  'Parabolic SAR': parabolicSarStrategy,
  'On-Balance Volume': obvStrategy,
  'CCI': cciStrategy,
  'ATR': atrStrategy,
  'Ichimoku Cloud': ichimokuStrategy,
};

export function getStrategy(strategyType) {
  const strategyFunction = strategies[strategyType];
  
  if (!strategyFunction) {
    throw new Error(`Strategy type "${strategyType}" is not supported or has not been implemented.`);
  }
  
  return strategyFunction;
}
