// File: backend/strategies/stochasticStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { Stochastic } from 'technicalindicators';

/**
 * Stochastic Oscillator Mean Reversion Strategy
 * Generates a 'buy' signal when the %K line crosses above the %D line in the oversold area.
 * Generates a 'sell' signal when the %K line crosses below the %D line in the overbought area.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function stochasticStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        period = 14,
        signalPeriod = 3,
        overbought = 80,
        oversold = 20,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);

    // --- Guard clause: Not enough data ---
    if (candles.length < period + signalPeriod) { // Need enough data for the indicator
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    const stochInput = {
        high: highs,
        low: lows,
        close: closes,
        period,
        signalPeriod,
    };
    
    const stochValues = Stochastic.calculate(stochInput);

    // We only need the last two points to check for a crossover
    const prev = stochValues[stochValues.length - 2];
    const current = stochValues[stochValues.length - 1];

    if (!prev || !current) {
        return { signal: 'hold' }; // Not enough data from the indicator library yet
    }
    
    // --- Signal Logic (Mean Reversion Crossover) ---

    // Buy Signal: If %K crosses above %D while in the oversold area.
    if (prev.k < prev.d && current.k >= current.d && current.k < oversold) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If %K crosses below %D while in the overbought area.
    if (prev.k > prev.d && current.k <= current.d && current.k > overbought) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If no signal is generated, always return a 'hold' signal.
    return { signal: 'hold' };
}
