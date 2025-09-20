// File: backend/strategies/bollingerBandsStrategy.js
// UPGRADED: Full implementation of the Bollinger Bands Mean Reversion strategy.

import { BollingerBands } from 'technicalindicators';

export function bollingerBandsStrategy(candles, params) {
    // Default parameters for the Bollinger Bands strategy
    const { period = 20, stdDev = 2, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the closing prices for the indicator
    const closes = candles.map(c => c[4]);
    if (closes.length < period) {
        console.log("Not enough candle data for Bollinger Bands calculation.");
        return [];
    }

    // 2. Calculate the Bollinger Bands once for efficiency
    const bbValues = BollingerBands.calculate({ period, values: closes, stdDev });
    const bbOffset = closes.length - bbValues.length; // Account for initial candles

    // 3. Loop through the bands to find trade signals
    for (let i = 0; i < bbValues.length; i++) {
        const candleIndex = i + bbOffset;
        const currentPrice = closes[candleIndex];
        const { upper, lower } = bbValues[i];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- LONG TRADE LOGIC ---
        // Enter a long position if the price touches or drops below the lower band
        if (currentPrice < lower && !position) {
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
        // Enter a short position if the price touches or rises above the upper band
        else if (currentPrice > upper && !position) {
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
        // Exit a long position if the price crosses the upper band, or a short if it crosses the lower
        else if (position && (
            (position === 'long' && currentPrice >= upper) ||
            (position === 'short' && currentPrice <= lower)
        )) {
            const entryTrade = trades[trades.length - 1];
            entryTrade.exitTime = currentTime;
            entryTrade.exitPrice = currentPrice;

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

