// File: backend/strategies/smaStrategy.js
// UPGRADED: Now creates trade objects that perfectly match the database schema.

import { SMA } from 'technicalindicators';

export function smaCrossoverStrategy(candles, params) {
    const { shortPeriod = 10, longPeriod = 50, tradeSize = 1 } = params;
    const trades = [];
    let position = null; // Can be 'long', 'short', or null

    const closes = candles.map(c => c[4]);
    if (closes.length < longPeriod) return [];

    const shortMA = SMA.calculate({ values: closes, period: shortPeriod });
    const longMA = SMA.calculate({ values: closes, period: longPeriod });
    
    const longMAOffset = closes.length - longMA.length;

    console.log(`--- Starting SMA Crossover Backtest ---`);
    console.log(`Parameters: Short=${shortPeriod}, Long=${longPeriod}`);

    for (let i = 1; i < longMA.length; i++) {
        const candleIndex = i + longMAOffset;
        const shortMAIndex = candleIndex - shortPeriod + 1;

        const prevShortMA = shortMA[shortMAIndex - 1];
        const currentShortMA = shortMA[shortMAIndex];
        const prevLongMA = longMA[i - 1];
        const currentLongMA = longMA[i];

        if (!currentShortMA || !currentLongMA) continue;

        // --- LONG TRADE LOGIC (Golden Cross) ---
        if (prevShortMA <= prevLongMA && currentShortMA > currentLongMA) {
            if (position === 'short') { // Exit short position
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTime = new Date(candles[candleIndex][0]);
                entryTrade.exitPrice = candles[candleIndex][4];
                entryTrade.profit = (entryTrade.entryPrice - entryTrade.exitPrice) * entryTrade.size;
                position = null;
            }
            if (!position) { // Enter long position
                position = 'long';
                trades.push({
                    entryTime: new Date(candles[candleIndex][0]),
                    entryPrice: candles[candleIndex][4],
                    signal: 'buy',
                    position: 'long', // ✅ ADDED: Required 'position' field
                    size: tradeSize,     // ✅ ADDED: Required 'size' field
                });
            }
        }
        // --- SHORT TRADE LOGIC (Death Cross) ---
        else if (prevShortMA >= prevLongMA && currentShortMA < currentLongMA) {
            if (position === 'long') { // Exit long position
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTime = new Date(candles[candleIndex][0]);
                entryTrade.exitPrice = candles[candleIndex][4];
                entryTrade.profit = (entryTrade.exitPrice - entryTrade.entryPrice) * entryTrade.size;
                position = null;
            }
             // NOTE: Short selling logic can be added here if desired
        }
    }

    console.log(`--- Backtest Finished: Total trades generated = ${trades.length} ---`);
    return trades;
}

