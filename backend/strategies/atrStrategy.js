// File: backend/strategies/atrStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { ATR } from "technicalindicators";

/**
 * ATR Volatility Breakout Strategy
 * Generates a 'buy' signal if the high breaks above the upper ATR band.
 * Generates a 'sell' signal if the low breaks below the lower ATR band.
 * Otherwise, generates a 'hold' signal.
 * * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold', params: object}} The trading signal for the current candle.
 */
export function atrStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        atrPeriod = 14,
        atrMultiplier = 2.0,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);

    // --- Guard clause: Not enough data ---
    if (candles.length < atrPeriod + 1) {
        return { signal: 'hold' }; // Not enough data to calculate, so hold.
    }

    // --- Indicator Calculation ---
    // We only need the most recent ATR value for our decision.
    const atrInput = {
        high: highs.slice(-(atrPeriod + 1)), // Get enough data for one ATR value
        low: lows.slice(-(atrPeriod + 1)),
        close: closes.slice(-(atrPeriod + 1)),
        period: atrPeriod,
    };
    const atrValues = ATR.calculate(atrInput);
    const currentAtr = atrValues[atrValues.length - 1];

    // --- Signal Logic ---
    // We make decisions based on the *previous* candle's close and the *current* candle's action.
    const prevClose = closes[closes.length - 2];
    const currentHigh = highs[highs.length - 1];
    const currentLow = lows[lows.length - 1];

    const upperBand = prevClose + (currentAtr * atrMultiplier);
    const lowerBand = prevClose - (currentAtr * atrMultiplier);

    // Buy Signal: If the current high breaks above the upper ATR band.
    if (currentHigh > upperBand) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If the current low breaks below the lower ATR band.
    if (currentLow < lowerBand) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If neither a buy nor a sell signal is generated, always return a 'hold' signal.
    return { signal: 'hold' };
}
