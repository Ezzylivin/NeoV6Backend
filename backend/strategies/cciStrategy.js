// File: backend/strategies/cciStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { CCI } from 'technicalindicators';

/**
 * Commodity Channel Index (CCI) Mean Reversion Strategy
 * Generates a 'buy' signal when the CCI crosses up from the oversold level.
 * Generates a 'sell' signal when the CCI crosses down from the overbought level.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function cciStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        cciPeriod = 20,
        overbought = 100,
        oversold = -100,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);

    // --- Guard clause: Not enough data ---
    if (candles.length < cciPeriod + 2) { // Need at least 2 CCI values to check for a cross
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    // We only need the last two CCI values to check for a crossover.
    const cciInput = {
        high: highs.slice(-(cciPeriod + 2)), // Get enough data for two CCI values
        low: lows.slice(-(cciPeriod + 2)),
        close: closes.slice(-(cciPeriod + 2)),
        period: cciPeriod,
    };
    
    const cciValues = CCI.calculate(cciInput);
    const prevCci = cciValues[cciValues.length - 2];
    const currentCci = cciValues[cciValues.length - 1];
    
    // --- Signal Logic (Mean Reversion Crossover) ---

    // Buy Signal: If the CCI crosses from below the oversold line to above it.
    if (prevCci < oversold && currentCci >= oversold) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If the CCI crosses from above the overbought line to below it.
    if (prevCci > overbought && currentCci <= overbought) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If no signal is generated, always return a 'hold' signal.
    return { signal: 'hold' };
}
