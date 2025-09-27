// File: backend/strategies/smaStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { SMA } from 'technicalindicators';

/**
 * Simple Moving Average (SMA) Crossover Strategy
 * Generates a 'buy' signal on a "Golden Cross" (short-period MA crosses above long-period MA).
 * Generates a 'sell' signal on a "Death Cross" (short-period MA crosses below long-period MA).
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function smaCrossoverStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        shortPeriod = 10,
        longPeriod = 50,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const closes = candles.map(c => c[4]);

    // --- Guard clause: Not enough data ---
    if (closes.length < longPeriod + 2) { // Need at least 2 long MA values to check for a cross
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    // Calculate the full series to correctly get the last two values
    const shortMAValues = SMA.calculate({ values: closes, period: shortPeriod });
    const longMAValues = SMA.calculate({ values: closes, period: longPeriod });

    // We only need the last two points of each series to check for a crossover
    const prevShortMA = shortMAValues[shortMAValues.length - 2];
    const currentShortMA = shortMAValues[shortMAValues.length - 1];
    
    const prevLongMA = longMAValues[longMAValues.length - 2];
    const currentLongMA = longMAValues[longMAValues.length - 1];

    if (!prevShortMA || !currentShortMA || !prevLongMA || !currentLongMA) {
        return { signal: 'hold' }; // Not enough data from the indicator library yet
    }
    
    // --- Signal Logic (Crossover) ---

    // Buy Signal (Golden Cross): If the short MA crosses from below the long MA to above it.
    if (prevShortMA < prevLongMA && currentShortMA >= currentLongMA) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal (Death Cross): If the short MA crosses from above the long MA to below it.
    if (prevShortMA > prevLongMA && currentShortMA <= currentLongMA) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If no crossover occurred, always return a 'hold' signal.
    return { signal: 'hold' };
}
