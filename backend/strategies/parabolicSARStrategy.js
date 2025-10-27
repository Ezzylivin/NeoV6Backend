// File: backend/strategies/parabolicSarStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { PSAR } from 'technicalindicators';

/**
 * Parabolic SAR (PSAR) Trend Following Strategy
 * Generates a 'buy' signal when the PSAR flips from above the price to below it.
 * Generates a 'sell' signal when the PSAR flips from below the price to above it.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function parabolicSARStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        step = 0.02,
        max = 0.2,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);

    // --- Guard clause: Not enough data ---
    if (candles.length < 3) { // PSAR needs at least 2-3 candles to start
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    const psarInput = {
        high: highs,
        low: lows,
        step,
        max,
    };
    
    const psarValues = PSAR.calculate(psarInput);

    // We only need the last two points of the PSAR and close prices to detect a flip
    const prevPsar = psarValues[psarValues.length - 2];
    const currentPsar = psarValues[psarValues.length - 1];

    const prevClose = closes[closes.length - 2];
    const currentClose = closes[closes.length - 1];
    
    if (!prevPsar || !currentPsar) {
        return { signal: 'hold' }; // Not enough data from the indicator library yet
    }

    // --- Signal Logic (Trend Following Flip) ---

    // Buy Signal: If the PSAR was above the price and has now flipped to be below the price.
    if (prevPsar > prevClose && currentPsar <= currentClose) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If the PSAR was below the price and has now flipped to be above the price.
    if (prevPsar < prevClose && currentPsar >= currentClose) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If no signal is generated, always return a 'hold' signal.
    return { signal: 'hold' };
}
