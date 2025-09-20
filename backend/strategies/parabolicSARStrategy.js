// File: backend/strategies/parabolicSarStrategy.js
// UPGRADED: Full implementation of the Parabolic SAR (Stop and Reverse) strategy.

import { PSAR } from 'technicalindicators';

export function parabolicSarStrategy(candles, params) {
    // Default parameters for the Parabolic SAR strategy
    // step is the acceleration factor, max is the maximum acceleration
    const { step = 0.02, max = 0.2, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the candle data for the indicator
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    if (candles.length < 2) { // PSAR needs at least 2 points to start
        console.log("Not enough candle data for Parabolic SAR calculation.");
        return [];
    }

    // 2. Calculate the PSAR values once for efficiency
    const psarValues = PSAR.calculate({ high: highs, low: lows, step, max });
    const psarOffset = candles.length - psarValues.length; // Account for initial candles

    // 3. Loop through the values to find trade signals
    for (let i = 1; i < psarValues.length; i++) {
        const candleIndex = i + psarOffset;
        const prevPsar = psarValues[i - 1];
        const currentPsar = psarValues[i];
        const prevClose = candles[candleIndex - 1][4];
        const currentClose = candles[candleIndex][4];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- LONG TRADE LOGIC ---
        // Enter a long position if the SAR dot flips from above to below the price
        if (prevPsar > prevClose && currentPsar <= currentClose && !position) {
            position = 'long';
            trades.push({
                entryTime: currentTime,
                entryPrice: currentClose,
                signal: 'buy',
                position: 'long',
                size: tradeSize,
            });
        }

        // --- SHORT TRADE LOGIC ---
        // Enter a short position if the SAR dot flips from below to above the price
        else if (prevPsar < prevClose && currentPsar >= currentClose && !position) {
            position = 'short';
            trades.push({
                entryTime: currentTime,
                entryPrice: currentClose,
                signal: 'sell',
                position: 'short',
                size: tradeSize,
            });
        }

        // --- EXIT LOGIC ---
        // Exit any position when the SAR flips in the opposite direction
        else if (position && (
            (position === 'long' && prevPsar < prevClose && currentPsar >= currentClose) ||
            (position === 'short' && prevPsar > prevClose && currentPsar <= currentClose)
        )) {
            const entryTrade = trades[trades.length - 1];
            entryTrade.exitTime = currentTime;
            entryTrade.exitPrice = currentClose;

            if (position === 'long') {
                entryTrade.profit = (entryTrade.exitPrice - entryTrade.entryPrice) * entryTrade.size;
            } else { // 'short'
                entryTrade.profit = (entryTrade.entryPrice - entryTrade.exitPrice) * entryTrade.size;
            }
            position = null; // Mark the position as closed
        }
    }

    return trades;
}

