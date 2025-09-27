// File: backend/strategies/obvStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { OBV, SMA } from 'technicalindicators';

/**
 * On-Balance Volume (OBV) Crossover Strategy
 * Generates a 'buy' signal when the OBV crosses above its Simple Moving Average (SMA).
 * Generates a 'sell' signal when the OBV crosses below its SMA.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function onBalanceVolumeStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        obvPeriod = 20,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const closes = candles.map(c => c[4]);
    const volumes = candles.map(c => c[5]);

    // --- Guard clause: Not enough data ---
    if (candles.length < obvPeriod + 2) { // Need at least 2 SMA values to check for a cross
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    const obvInput = { close: closes, volume: volumes };
    const obvValues = OBV.calculate(obvInput);

    const smaInput = { values: obvValues, period: obvPeriod };
    const obvSmaValues = SMA.calculate(smaInput);

    // We only need the last two points of each series to check for a crossover
    const prevObv = obvValues[obvValues.length - 2];
    const currentObv = obvValues[obvValues.length - 1];

    const prevSma = obvSmaValues[obvSmaValues.length - 2];
    const currentSma = obvSmaValues[obvSmaValues.length - 1];
    
    if (prevObv === undefined || currentObv === undefined || prevSma === undefined || currentSma === undefined) {
        return { signal: 'hold' }; // Not enough data from the indicator library yet
    }

    // --- Signal Logic (Crossover) ---

    // Buy Signal: If the OBV crosses from below its SMA to above it.
    if (prevObv < prevSma && currentObv >= currentSma) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If the OBV crosses from above its SMA to below it.
    if (prevObv > prevSma && currentObv <= prevSma) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If no crossover occurred, always return a 'hold' signal.
    return { signal: 'hold' };
}
