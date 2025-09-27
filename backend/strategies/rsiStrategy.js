// File: backend/strategies/rsiStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { RSI } from 'technicalindicators';

/**
 * Relative Strength Index (RSI) Mean Reversion Strategy
 * Generates a 'buy' signal when the RSI crosses up from the oversold level.
 * Generates a 'sell' signal when the RSI crosses down from the overbought level.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function rsiStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        rsiPeriod = 14,
        overbought = 70,
        oversold = 30,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const closes = candles.map(c => c[4]);

    // --- Guard clause: Not enough data ---
    if (closes.length < rsiPeriod + 2) { // Need at least 2 RSI values to check for a cross
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    // We only need the last two RSI values to check for a crossover.
    const rsiInput = {
        values: closes,
        period: rsiPeriod,
    };
    
    const rsiValues = RSI.calculate(rsiInput);
    
    const prevRsi = rsiValues[rsiValues.length - 2];
    const currentRsi = rsiValues[rsiValues.length - 1];

    if (prevRsi === undefined || currentRsi === undefined) {
        return { signal: 'hold' }; // Not enough data from the indicator library yet
    }
    
    // --- Signal Logic (Mean Reversion Crossover) ---

    // Buy Signal: If the RSI crosses from below the oversold line to above it.
    if (prevRsi < oversold && currentRsi >= oversold) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If the RSI crosses from above the overbought line to below it.
    if (prevRsi > overbought && currentRsi <= overbought) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If no signal is generated, always return a 'hold' signal.
    return { signal: 'hold' };
}
