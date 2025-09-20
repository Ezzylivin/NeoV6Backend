// File: backend/strategies/ichimokuStrategy.js
// UPGRADED: Full implementation of the Ichimoku Cloud strategy.

import { IchimokuCloud } from 'technicalindicators';

export function ichimokuCloudStrategy(candles, params) {
    // Default parameters for the Ichimoku Cloud strategy
    const { conversionPeriod = 9, basePeriod = 26, spanPeriod = 52, displacement = 26, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the candle data for the indicator
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    if (candles.length < spanPeriod) {
        console.log("Not enough candle data for Ichimoku Cloud calculation.");
        return [];
    }

    // 2. Calculate the Ichimoku Cloud values once for efficiency
    const ichimokuValues = IchimokuCloud.calculate({
        high: highs,
        low: lows,
        conversionPeriod,
        basePeriod,
        spanPeriod,
        displacement
    });
    // The indicator result is displaced, so we need to align it with the candles
    const ichimokuOffset = candles.length - ichimokuValues.length;

    // 3. Loop through the values to find trade signals
    for (let i = 1; i < ichimokuValues.length; i++) {
        const candleIndex = i + ichimokuOffset;
        const currentPrice = candles[candleIndex][4];
        const currentTime = new Date(candles[candleIndex][0]);
        const prev = ichimokuValues[i - 1];
        const current = ichimokuValues[i];

        // Define cloud conditions
        const isAboveCloud = currentPrice > current.spanA && currentPrice > current.spanB;
        const isBelowCloud = currentPrice < current.spanA && currentPrice < current.spanB;
        
        // --- LONG TRADE LOGIC ---
        // Enter a long position on a bullish crossover above the cloud
        if (prev.conversion < prev.base && current.conversion >= current.base && isAboveCloud && !position) {
            position = 'long';
            trades.push({
                entryTime: currentTime,
                entryPrice: currentPrice,
                signal: 'buy',
                position: 'long',
                size: tradeSize,
            });
        }

        // --- SHORT TRADE LOGIC ---
        // Enter a short position on a bearish crossover below the cloud
        else if (prev.conversion > prev.base && current.conversion <= current.base && isBelowCloud && !position) {
            position = 'short';
             trades.push({
                entryTime: currentTime,
                entryPrice: currentPrice,
                signal: 'sell',
                position: 'short',
                size: tradeSize,
            });
        }

        // --- EXIT LOGIC ---
        // Exit any position when the conversion and base lines cross in the opposite direction
        else if (position && (
            (position === 'long' && prev.conversion > prev.base && current.conversion <= current.base) ||
            (position === 'short' && prev.conversion < prev.base && current.conversion >= current.base)
        )) {
            const entryTrade = trades[trades.length - 1];
            entryTrade.exitTime = currentTime;
            entryTrade.exitPrice = currentPrice;
            if(position === 'long') {
                entryTrade.profit = (entryTrade.exitPrice - entryTrade.entryPrice) * entryTrade.size;
            } else { // 'short'
                 entryTrade.profit = (entryTrade.entryPrice - entryTrade.exitPrice) * entryTrade.size;
            }
            position = null; // Mark the position as closed
        }
    }
    return trades;
}

