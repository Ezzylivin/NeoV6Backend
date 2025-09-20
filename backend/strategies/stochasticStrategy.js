// File: backend/strategies/stochasticStrategy.js
// UPGRADED: Full implementation of the Stochastic Oscillator strategy.

import { Stochastic } from 'technicalindicators';

export function stochasticStrategy(candles, params) {
    // Default parameters for the Stochastic Oscillator strategy
    const { period = 14, signalPeriod = 3, overbought = 80, oversold = 20, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the candle data for the indicator
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);
    if (candles.length < period) {
        console.log("Not enough candle data for Stochastic Oscillator calculation.");
        return [];
    }

    // 2. Calculate the Stochastic values once for efficiency
    const stochValues = Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period,
        signalPeriod
    });
    const stochOffset = candles.length - stochValues.length; // Account for initial candles

    // 3. Loop through the values to find trade signals
    for (let i = 1; i < stochValues.length; i++) {
        const candleIndex = i + stochOffset;
        const prev = stochValues[i - 1];
        const current = stochValues[i];
        const currentPrice = closes[candleIndex];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- LONG TRADE LOGIC ---
        // Enter a long position if %K crosses above %D in the oversold zone
        if (prev.k < prev.d && current.k >= current.d && current.k < oversold && !position) {
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
        // Enter a short position if %K crosses below %D in the overbought zone
        else if (prev.k > prev.d && current.k <= current.d && current.k > overbought && !position) {
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
        // Exit a long position if a bearish cross occurs in the overbought zone
        // Exit a short position if a bullish cross occurs in the oversold zone
        else if (position && (
            (position === 'long' && prev.k > prev.d && current.k <= current.d && current.k > overbought) ||
            (position === 'short' && prev.k < prev.d && current.k >= current.d && current.k < oversold)
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

