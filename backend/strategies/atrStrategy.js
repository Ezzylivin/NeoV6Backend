// File: backend/strategies/atrStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { ATR } from "technicalindicators";

/**
 * ATR Volatility Breakout Strategy
 * Generates a 'buy' signal if the high breaks above the upper ATR band.
 * Generates a 'sell' signal if the low breaks below the lower ATR band.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
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
    if (candles.length < atrPeriod + 2) { // Need prevClose, so length must be > atrPeriod+1
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    const atrInput = {
        high: highs.slice(-(atrPeriod + 2)), // Get enough data for one stable ATR value
        low: lows.slice(-(atrPeriod + 2)),
        close: closes.slice(-(atrPeriod + 2)),
        period: atrPeriod,
    };
    const atrValues = ATR.calculate(atrInput);
    const currentAtr = atrValues[atrValues.length - 1];

    if (isNaN(currentAtr)) {
        return { signal: 'hold' }; // Indicator returned NaN, not ready yet.
    }

    // --- Signal Logic ---
    const prevClose = closes[closes.length - 2];
    const currentHigh = highs[highs.length - 1];
    const currentLow = lows[lows.length - 1];

    const upperBand = prevClose + (currentAtr * atrMultiplier);
    const lowerBand = prevClose - (currentAtr * atrMultiplier);

    // ✅ --- ADD THIS CONSOLE LOG FOR DEBUGGING --- ✅
    // This will log the values for the last candle in the series provided by the backtester.
    // To prevent flooding the console, we'll log roughly every 100 candles.
    if (candles.length % 100 === 0) {
        const timestamp = new Date(candles[candles.length - 1][0]);
        console.log(
            `[ATR DEBUG @ ${timestamp.toLocaleString()}] \n` +
            `  - Current High:  ${currentHigh.toFixed(2)} vs. Upper Band: ${upperBand.toFixed(2)} (Breakout? ${currentHigh > upperBand}) \n` +
            `  - Current Low:   ${currentLow.toFixed(2)} vs. Lower Band: ${lowerBand.toFixed(2)} (Breakout? ${currentLow < lowerBand})`
        );
    }
    // ✅ --- END OF CONSOLE LOG --- ✅

    // Buy Signal: If the current high breaks above the upper ATR band.
    if (currentHigh > upperBand) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If the current low breaks below the lower ATR band.
    if (currentLow < lowerBand) {
        return { signal: 'sell', params: restParams };
    }

    return { signal: 'hold' };
}
