// File: backend/strategies/macdStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { MACD } from 'technicalindicators';

/**
 * MACD Crossover Strategy
 * Generates a 'buy' signal when the MACD line crosses above the signal line.
 * Generates a 'sell' signal when the MACD line crosses below the signal line.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function macdStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        fastPeriod = 12,
        slowPeriod = 26,
        signalPeriod = 9,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const closes = candles.map(c => c[4]);

    // --- Guard clause: Not enough data ---
    // Need at least slowPeriod + signalPeriod candles for a reliable MACD calculation
    if (closes.length < slowPeriod + signalPeriod) {
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    const macdInput = {
        values: closes,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    };
    
    const macdValues = MACD.calculate(macdInput);
    
    // We only need the last two points to check for a crossover
    const prev = macdValues[macdValues.length - 2];
    const current = macdValues[macdValues.length - 1];

    if (!prev || !current) {
        return { signal: 'hold' }; // Not enough data from the indicator library yet
    }
    
    // --- Signal Logic (Crossover) ---

    // Buy Signal: If the MACD line crosses from below the signal line to above it.
    if (prev.MACD < prev.signal && current.MACD >= current.signal) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If the MACD line crosses from above the signal line to below it.
    if (prev.MACD > prev.signal && current.MACD <= current.signal) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If no crossover occurred, always return a 'hold' signal.
    return { signal: 'hold' };
}
