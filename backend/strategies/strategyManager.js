// File: backend/strategies/strategyManager.js
// NEW: Defines and manages all available trading strategies.

import technicalindicators from 'technicalindicators';

// --- Import all strategy files ---
import { rsiStrategy } from './rsiStrategy.js';
import { macdStrategy } from './macdStrategy.js';
import { bollingerBandsStrategy } from './bollingerBandsStrategy.js';
import { smaCrossoverStrategy } from './smaCrossoverStrategy.js';
import { stochasticStrategy } from './stochasticStrategy.js';
import { parabolicSARStrategy } from './parabolicSARStrategy.js';
import { onBalanceVolumeStrategy } from './onBalanceVolumeStrategy.js';
import { cciStrategy } from './cciStrategy.js';
import { atrStrategy } from './atrStrategy.js';
import { ichimokuCloudStrategy } from './ichimokuCloudStrategy.js';

// --- Strategy Map ---
const strategies = {
    'Moving Average Crossover': smaCrossoverStrategy,
    'RSI': rsiStrategy,
    'MACD': macdStrategy,
    'Bollinger Bands': bollingerBandsStrategy,
    'Stochastic Oscillator': stochasticStrategy,
    'Parabolic SAR': parabolicSARStrategy,
    'On-Balance Volume': onBalanceVolumeStrategy,
    'CCI': cciStrategy,
    'ATR': atrStrategy,
    'Ichimoku Cloud': ichimokuCloudStrategy,
};

// Export a function to get the correct strategy logic
export const getStrategy = (strategyType) => {
    const strategy = strategies[strategyType];
    if (!strategy) {
        throw new Error(`Strategy type '${strategyType}' is not supported.`);
    }
    return strategy;
};
