// File: backend/strategies/rsiStrategy.js
// UPGRADED: Full implementation of the RSI (Relative Strength Index) strategy.

import { RSI } from 'technicalindicators';

export function rsiStrategy(candles, params) {
    // Default parameters for the RSI strategy
    const { rsiPeriod = 14, overbought = 70, oversold = 30, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the closing prices for the indicator
    const closes = candles.map(c => c[4]); // candle[4] is the close price
    if (closes.length < rsiPeriod) {
        console.log("Not enough candle data for RSI calculation.");
        return [];
    }

    // 2. Calculate the RSI values once for efficiency
    const rsiValues = RSI.calculate({ values: closes, period: rsiPeriod });
    const rsiOffset = closes.length - rsiValues.length; // Account for the initial candles where RSI is not calculated

    // 3. Loop through the RSI values to find trade signals
    for (let i = 1; i < rsiValues.length; i++) {
        const candleIndex = i + rsiOffset;
        const prevRsi = rsiValues[i - 1];
        const currentRsi = rsiValues[i];
        const currentPrice = closes[candleIndex];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- LONG TRADE LOGIC ---
        // Enter a long position if RSI crosses up from the oversold level
        if (prevRsi < oversold && currentRsi >= oversold && !position) {
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
        // Enter a short position if RSI crosses down from the overbought level
        else if (prevRsi > overbought && currentRsi <= overbought && !position) {
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
        // Exit any position if the opposite extreme is reached
        else if (position && (
            (position === 'long' && currentRsi >= overbought) ||
            (position === 'short' && currentRsi <= oversold)
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

