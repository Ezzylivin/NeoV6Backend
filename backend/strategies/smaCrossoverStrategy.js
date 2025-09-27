// File: backend/strategies/smaStrategy.js
// PREMIUM UPGRADE: SMA Crossover strategy with SL, TP, Trailing Stop, and full trade objects.

import { SMA } from 'technicalindicators';

export function smaCrossoverStrategy(candles, params = {}) {
    const {
        shortPeriod = 10,
        longPeriod = 50,
        tradeSize = 1,
        SL = 0,            // % stop loss
        TP = 0,            // % take profit
        trailingStop = 0,  // % trailing stop
    } = params;

    const trades = [];
    let position = null;
    let trailingLevel = null;
    let highestPrice = -Infinity;
    let lowestPrice = Infinity;

    const closes = candles.map(c => c[4]);
    if (closes.length < longPeriod) return [];

    const shortMA = SMA.calculate({ values: closes, period: shortPeriod });
    const longMA = SMA.calculate({ values: closes, period: longPeriod });
    const longMAOffset = closes.length - longMA.length;

    for (let i = 1; i < longMA.length; i++) {
        const candleIndex = i + longMAOffset;
        const shortMAIndex = candleIndex - shortPeriod + 1;
        const prevShortMA = shortMA[shortMAIndex - 1];
        const currentShortMA = shortMA[shortMAIndex];
        const prevLongMA = longMA[i - 1];
        const currentLongMA = longMA[i];
        const price = closes[candleIndex];
        const time = new Date(candles[candleIndex][0]);

        if (!currentShortMA || !currentLongMA) continue;

        // --- Handle existing position ---
        if (position) {
            const lastTrade = trades[trades.length - 1];

            if (position === "long") {
                highestPrice = Math.max(highestPrice, price);
                if (trailingStop > 0) trailingLevel = highestPrice * (1 - trailingStop / 100);

                if (SL > 0 && price <= lastTrade.entryPrice * (1 - SL / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 - SL / 100);
                } else if (TP > 0 && price >= lastTrade.entryPrice * (1 + TP / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 + TP / 100);
                } else if (trailingLevel && price <= trailingLevel) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = trailingLevel;
                } else if (currentShortMA < currentLongMA) { // Death cross
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = price;
                }

                if (lastTrade.exitTime) {
                    lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
                    lastTrade.returnPct = ((lastTrade.profit / lastTrade.entryPrice) * 100).toFixed(2);
                    lastTrade.duration = `${Math.round((lastTrade.exitTime - lastTrade.entryTime) / (1000 * 60))} min`;
                    lastTrade.exitReason = lastTrade.exitPrice === price ? "MA Death Cross"
                        : lastTrade.exitPrice === trailingLevel ? "Trailing Stop"
                        : lastTrade.exitPrice === lastTrade.entryPrice * (1 + TP / 100) ? "Take Profit"
                        : "Stop Loss";

                    position = null;
                    trailingLevel = null;
                    highestPrice = -Infinity;
                }
            }

            if (position === "short") {
                lowestPrice = Math.min(lowestPrice, price);
                if (trailingStop > 0) trailingLevel = lowestPrice * (1 + trailingStop / 100);

                if (SL > 0 && price >= lastTrade.entryPrice * (1 + SL / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 + SL / 100);
                } else if (TP > 0 && price <= lastTrade.entryPrice * (1 - TP / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 - TP / 100);
                } else if (trailingLevel && price >= trailingLevel) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = trailingLevel;
                } else if (currentShortMA > currentLongMA) { // Golden cross
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = price;
                }

                if (lastTrade.exitTime) {
                    lastTrade.profit = (lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
                    lastTrade.returnPct = ((lastTrade.profit / lastTrade.entryPrice) * 100).toFixed(2);
                    lastTrade.duration = `${Math.round((lastTrade.exitTime - lastTrade.entryTime) / (1000 * 60))} min`;
                    lastTrade.exitReason = lastTrade.exitPrice === price ? "MA Golden Cross"
                        : lastTrade.exitPrice === trailingLevel ? "Trailing Stop"
                        : lastTrade.exitPrice === lastTrade.entryPrice * (1 - TP / 100) ? "Take Profit"
                        : "Stop Loss";

                    position = null;
                    trailingLevel = null;
                    lowestPrice = Infinity;
                }
            }
        }

        // --- Entry Logic ---
        if (!position) {
            if (prevShortMA <= prevLongMA && currentShortMA > currentLongMA) { // Golden Cross
                position = 'long';
                highestPrice = price;
                trailingLevel = trailingStop > 0 ? price * (1 - trailingStop / 100) : null;
                trades.push({ entryTime: time, entryPrice: price, signal: 'buy', position, size: tradeSize });
            } else if (prevShortMA >= prevLongMA && currentShortMA < currentLongMA) { // Death Cross
                position = 'short';
                lowestPrice = price;
                trailingLevel = trailingStop > 0 ? price * (1 + trailingStop / 100) : null;
                trades.push({ entryTime: time, entryPrice: price, signal: 'sell', position, size: tradeSize });
            }
        }
    }

    // --- Close any open trade at last candle ---
    if (position && trades.length > 0) {
        const lastTrade = trades[trades.length - 1];
        if (!lastTrade.exitTime) {
            const lastIdx = closes.length - 1;
            lastTrade.exitTime = new Date(candles[lastIdx][0]);
            lastTrade.exitPrice = closes[lastIdx];
            lastTrade.profit = (position === "long"
                ? lastTrade.exitPrice - lastTrade.entryPrice
                : lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
            lastTrade.returnPct = ((lastTrade.profit / lastTrade.entryPrice) * 100).toFixed(2);
            lastTrade.duration = `${Math.round((lastTrade.exitTime - lastTrade.entryTime) / (1000 * 60))} min`;
            lastTrade.exitReason = "End of Data";
        }
    }

    return trades;
}
