// File: backend/strategies/cciStrategy.js
// UPGRADED: Full implementation of the CCI (Commodity Channel Index) strategy.

import { CCI } from 'technicalindicators';

export function cciStrategy(candles, params) {
    // Default parameters for the CCI strategy
    const { cciPeriod = 20, overbought = 100, oversold = -100, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the candle data for the indicator
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);
    if (candles.length < cciPeriod) {
        console.log("Not enough candle data for CCI calculation.");
        return [];
    }

    // 2. Calculate the CCI values once for efficiency
    const cciValues = CCI.calculate({ high: highs, low: lows, close: closes, period: cciPeriod });
    const cciOffset = closes.length - cciValues.length; // Account for initial candles

    // 3. Loop through the values to find trade signals
    for (let i = 1; i < cciValues.length; i++) {
        const candleIndex = i + cciOffset;
        const prevCci = cciValues[i-1];
        const currentCci = cciValues[i];
        const currentPrice = closes[candleIndex];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- LONG TRADE LOGIC ---
        // Enter a long position if CCI crosses up from the oversold level
        if (prevCci < oversold && currentCci >= oversold && !position) {
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
        // Enter a short position if CCI crosses down from the overbought level
        else if (prevCci > overbought && currentCci <= overbought && !position) {
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
        // Exit a long position if the overbought level is crossed
        // Exit a short position if the oversold level is crossed
        else if (position && (
            (position === 'long' && currentCci >= overbought) ||
            (position === 'short' && currentCci <= oversold)
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

