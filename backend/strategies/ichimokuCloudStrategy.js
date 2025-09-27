// File: backend/strategies/ichimokuStrategy.js
// UPGRADED: Converted to a signal generator for the new backtesting engine.

import { IchimokuCloud } from 'technicalindicators';

/**
 * Ichimoku Cloud Crossover Strategy
 * Generates a 'buy' signal on a bullish Kijun/Tenkan crossover above the cloud.
 * Generates a 'sell' signal on a bearish Kijun/Tenkan crossover below the cloud.
 * Otherwise, generates a 'hold' signal.
 * @param {Array<Array<number>>} candles - The historical OHLCV candle data.
 * @param {object} params - The parameters for the strategy.
 * @returns {{signal: 'buy'|'sell'|'hold'}} The trading signal for the current candle.
 */
export function ichimokuCloudStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        conversionPeriod = 9,
        basePeriod = 26,
        spanPeriod = 52,
        displacement = 26,
        ...restParams // Pass through other params like SL, TP
    } = params;

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);
    const lastClose = closes[closes.length - 1];

    // --- Guard clause: Not enough data ---
    // The required length is complex, but spanPeriod is a good approximation for the minimum.
    if (candles.length < spanPeriod + displacement) {
        return { signal: 'hold' };
    }

    // --- Indicator Calculation ---
    const ichimokuInput = {
        high: highs,
        low: lows,
        conversionPeriod,
        basePeriod,
        spanPeriod,
        displacement,
    };
    
    // The library calculates values for the entire series
    const ichimokuValues = IchimokuCloud.calculate(ichimokuInput);
    
    // We only need the last two points to check for a crossover
    const current = ichimokuValues[ichimokuValues.length - 1];
    const prev = ichimokuValues[ichimokuValues.length - 2];

    // --- Signal Logic (Trend Following Crossover) ---

    // Condition 1: Is the price in a clear trend?
    const isPriceAboveCloud = lastClose > current.spanA && lastClose > current.spanB;
    const isPriceBelowCloud = lastClose < current.spanA && lastClose < current.spanB;

    // Condition 2: Has a crossover just occurred?
    const bullishCrossover = prev.conversion < prev.base && current.conversion >= current.base;
    const bearishCrossover = prev.conversion > prev.base && current.conversion <= current.base;

    // Buy Signal: If a bullish crossover happens while the price is above the cloud.
    if (bullishCrossover && isPriceAboveCloud) {
        return { signal: 'buy', params: restParams };
    }

    // Sell Signal: If a bearish crossover happens while the price is below the cloud.
    if (bearishCrossover && isPriceBelowCloud) {
        return { signal: 'sell', params: restParams };
    }

    // ✅ THE FIX: If no signal is generated, always return a 'hold' signal.
    return { signal: 'hold' };
}
