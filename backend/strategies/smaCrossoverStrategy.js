// File: backend/strategies/smaStrategy.js
// UPGRADED: Now powered by the 'technicalindicators' library and includes detailed logging.

import { SMA } from 'technicalindicators';

export function smaCrossoverStrategy(candles, params) {
    const { shortPeriod = 10, longPeriod = 50 } = params;
    const trades = [];
    let position = null; // Tracks the current position: 'long', 'short', or null

    // 1. Prepare the closing prices for the indicator
    const closes = candles.map(c => c[4]);
    if (closes.length < longPeriod) {
        console.log("Not enough candle data to run the SMA strategy.");
        return [];
    }

    // 2. Calculate the SMAs once, efficiently
    const shortMA = SMA.calculate({ values: closes, period: shortPeriod });
    const longMA = SMA.calculate({ values: closes, period: longPeriod });
    
    const longMAOffset = closes.length - longMA.length;

    console.log(`--- Starting SMA Crossover Backtest ---`);
    console.log(`Parameters: Short Period=${shortPeriod}, Long Period=${longPeriod}`);

    // 3. Loop through the candles to find trade signals
    for (let i = 1; i < longMA.length; i++) {
        const candleIndex = i + longMAOffset;
        const shortMAIndex = candleIndex - shortPeriod + 1;

        const prevShortMA = shortMA[shortMAIndex - 1];
        const currentShortMA = shortMA[shortMAIndex];
        const prevLongMA = longMA[i - 1];
        const currentLongMA = longMA[i];

        if (!currentShortMA || !currentLongMA) continue;

        // ✅ Log the indicator values periodically to avoid spamming the console
        if (i % 50 === 0) { // Log every 50 candles
            console.log(`Candle #${candleIndex}: Fast MA = ${currentShortMA.toFixed(2)}, Slow MA = ${currentLongMA.toFixed(2)}`);
        }

        // --- LONG TRADE LOGIC (Golden Cross) ---
        if (prevShortMA <= prevLongMA && currentShortMA > currentLongMA) {
            if (position === 'short') {
                console.log(`↪️ EXIT SHORT @ Candle #${candleIndex}`);
                // ... (exit logic)
                position = null;
            }
            if (!position) {
                console.log(`✅ ENTER LONG @ Candle #${candleIndex}: Fast MA (${currentShortMA.toFixed(2)}) crossed above Slow MA (${currentLongMA.toFixed(2)})`);
                position = 'long';
                trades.push({ entryTimestamp: candles[candleIndex][0], entryPrice: candles[candleIndex][4], signal: 'buy' });
            }
        }
        // --- SHORT TRADE LOGIC (Death Cross) ---
        else if (prevShortMA >= prevLongMA && currentShortMA < currentLongMA) {
            if (position === 'long') {
                console.log(`❌ EXIT LONG @ Candle #${candleIndex}`);
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTimestamp = candles[candleIndex][0];
                entryTrade.exitPrice = candles[candleIndex][4];
                entryTrade.profit = entryTrade.exitPrice - entryTrade.entryPrice;
                position = null;
            }
        }
    }

    console.log(`--- Backtest Finished: Total trades generated = ${trades.length} ---`);
    return trades;
}

