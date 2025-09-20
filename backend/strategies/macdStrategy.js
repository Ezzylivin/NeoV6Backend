// File: backend/strategies/macdStrategy.js
// UPGRADED: Full implementation of the MACD (Moving Average Convergence Divergence) strategy.

import { MACD } from 'technicalindicators';

export function macdStrategy(candles, params) {
    // Default parameters for the MACD strategy
    const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the closing prices for the indicator
    const closes = candles.map(c => c[4]);
    if (closes.length < slowPeriod) {
        console.log("Not enough candle data for MACD calculation.");
        return [];
    }

    // 2. Calculate the MACD values once for efficiency
    const macdValues = MACD.calculate({
        values: closes,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    // Account for the initial candles where MACD is not calculated
    const macdOffset = closes.length - macdValues.length;

    // 3. Loop through the MACD values to find trade signals
    for (let i = 1; i < macdValues.length; i++) {
        const candleIndex = i + macdOffset;
        const prev = macdValues[i - 1];
        const current = macdValues[i];
        const currentPrice = closes[candleIndex];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- LONG TRADE LOGIC ---
        // Enter a long position if the MACD line crosses above the signal line
        if (prev.MACD < prev.signal && current.MACD >= current.signal && !position) {
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
        // Enter a short position if the MACD line crosses below the signal line
        else if (prev.MACD > prev.signal && current.MACD <= current.signal && !position) {
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
        // Exit any position if a crossover in the opposite direction occurs
        else if (position && (
            (position === 'long' && prev.MACD > prev.signal && current.MACD <= current.signal) ||
            (position === 'short' && prev.MACD < prev.signal && current.MACD >= current.signal)
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

