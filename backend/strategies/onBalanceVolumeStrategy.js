// File: backend/strategies/obvStrategy.js
// UPGRADED: Full implementation of the On-Balance Volume (OBV) strategy.

import { OBV, SMA } from 'technicalindicators';

export function onBalanceVolumeStrategy(candles, params) {
    // Default parameters for the OBV strategy
    const { obvPeriod = 20, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    // 1. Prepare the candle data for the indicator
    const closes = candles.map(c => c[4]);
    const volumes = candles.map(c => c[5]);
    if (candles.length < obvPeriod) {
        console.log("Not enough candle data for OBV calculation.");
        return [];
    }

    // 2. Calculate the OBV and its moving average
    const obvValues = OBV.calculate({ close: closes, volume: volumes });
    const obvSma = SMA.calculate({ values: obvValues, period: obvPeriod });
    const obvOffset = obvValues.length - obvSma.length; // Account for initial candles

    // 3. Loop through the values to find trade signals
    for (let i = 1; i < obvSma.length; i++) {
        const candleIndex = i + obvOffset;
        const prevObv = obvValues[candleIndex - 1];
        const currentObv = obvValues[candleIndex];
        const prevSma = obvSma[i - 1];
        const currentSma = obvSma[i];
        const currentPrice = closes[candleIndex];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- LONG TRADE LOGIC ---
        // Enter a long position if OBV crosses above its moving average
        if (prevObv <= prevSma && currentObv > currentSma) {
            if (position === 'short') { // Exit short
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTime = currentTime;
                entryTrade.exitPrice = currentPrice;
                entryTrade.profit = (entryTrade.entryPrice - entryTrade.exitPrice) * entryTrade.size;
                position = null;
            }
            if (!position) { // Enter long
                position = 'long';
                trades.push({
                    entryTime: currentTime,
                    entryPrice: currentPrice,
                    signal: 'buy',
                    position: 'long',
                    size: tradeSize,
                });
            }
        }

        // --- SHORT TRADE LOGIC ---
        // Enter a short position if OBV crosses below its moving average
        else if (prevObv >= prevSma && currentObv < currentSma) {
            if (position === 'long') { // Exit long
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTime = currentTime;
                entryTrade.exitPrice = currentPrice;
                entryTrade.profit = (entryTrade.exitPrice - entryTrade.entryPrice) * entryTrade.size;
                position = null;
            }
            if (!position) { // Enter short
                position = 'short';
                trades.push({
                    entryTime: currentTime,
                    entryPrice: currentPrice,
                    signal: 'sell',
                    position: 'short',
                    size: tradeSize,
                });
            }
        }
    }

    return trades;
}

