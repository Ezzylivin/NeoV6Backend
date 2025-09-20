// File: backend/strategies/atrStrategy.js
// UPGRADED: Full implementation of the ATR (Average True Range) Volatility Breakout strategy.

import { ATR } from 'technicalindicators';

export function atrStrategy(candles, params) {
    // Default parameters for the ATR strategy
    const { atrPeriod = 14, atrMultiplier = 2.0, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the candle data for the indicator
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);

    if (candles.length < atrPeriod) {
        console.log("Not enough candle data for ATR calculation.");
        return [];
    }

    // 2. Calculate the ATR values once for efficiency
    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });
    const atrOffset = candles.length - atrValues.length; // Account for initial candles

    // 3. Loop through the values to find trade signals
    for (let i = 1; i < atrValues.length; i++) {
        const candleIndex = i + atrOffset;
        const prevClose = closes[candleIndex - 1];
        const atr = atrValues[i];
        
        // Define the volatility breakout bands
        const upperBand = prevClose + (atr * atrMultiplier);
        const lowerBand = prevClose - (atr * atrMultiplier);
        
        const currentHigh = highs[candleIndex];
        const currentLow = lows[candleIndex];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- LONG TRADE LOGIC ---
        // Enter a long position on a breakout above the upper band
        if (currentHigh > upperBand) {
            if (position === 'short') { // Exit a short position
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTime = currentTime;
                entryTrade.exitPrice = upperBand;
                entryTrade.profit = (entryTrade.entryPrice - entryTrade.exitPrice) * entryTrade.size;
                position = null;
            }
            if (!position) { // Enter a new long position
                position = 'long';
                trades.push({
                    entryTime: currentTime,
                    entryPrice: upperBand, // Enter at the breakout price
                    signal: 'buy',
                    position: 'long',
                    size: tradeSize,
                });
            }
        }
        // --- SHORT TRADE LOGIC ---
        // Enter a short position on a breakdown below the lower band
        else if (currentLow < lowerBand) {
            if (position === 'long') { // Exit a long position
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTime = currentTime;
                entryTrade.exitPrice = lowerBand;
                entryTrade.profit = (entryTrade.exitPrice - entryTrade.entryPrice) * entryTrade.size;
                position = null;
            }
            if (!position) { // Enter a new short position
                position = 'short';
                 trades.push({
                    entryTime: currentTime,
                    entryPrice: lowerBand, // Enter at the breakdown price
                    signal: 'sell',
                    position: 'short',
                    size: tradeSize,
                });
            }
        }
    }

    return trades;
}

