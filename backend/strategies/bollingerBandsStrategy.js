// File: backend/strategies/bollingerBandsStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { BollingerBands } from "technicalindicators";

/**
 * Bollinger Bands Mean Reversion Strategy
 * Generates a 'buy' signal if the close price touches or crosses below the lower band.
 * Generates a 'sell' signal if the close price touches or crosses above the upper band.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function bollingerBandsStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        period = 20,
        stdDev = 2,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const closes = candles.map(c => c[4]);

    // --- Guard clause: Not enough data ---
    if (closes.length < period) {
        return { signal: 'hold' }; // Not enough data to calculate, so hold.
    }

    // --- Indicator Calculation ---
    // We only need the most recent Bollinger Band values for our decision.
    const bbInput = {
        period,
        values: closes,
        stdDev,
    };
    
    const bbValues = BollingerBands.calculate(bbInput);
    // Get the latest band values which correspond to the latest candle
    const latestBand = bbValues[bbValues.length - 1];
    const { upper, lower } = latestBand;
    
    const currentClose = closes[closes.length - 1];

    // --- Signal Logic (Mean Reversion) ---

    // Buy Signal: If the current close price is at or below the lower band.
    if (currentClose <= lower) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If the current close price is at or above the upper band.
    if (currentClose >= upper) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If neither a buy nor a sell signal is generated, always return a 'hold' signal.
    return { signal: 'hold' };
}
