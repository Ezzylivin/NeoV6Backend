// File: backend/strategies/ichimokuStrategy.js
// PREMIUM UPGRADE: Ichimoku Cloud strategy with SL, TP, and Trailing Stop Loss.

import { IchimokuCloud } from 'technicalindicators';

export function ichimokuCloudStrategy(candles, params = {}) {
    const {
        conversionPeriod = 9,
        basePeriod = 26,
        spanPeriod = 52,
        displacement = 26,
        tradeSize = 1,
        SL = 0,             // % stop loss
        TP = 0,             // % take profit
        trailingStop = 0,   // % trailing stop
    } = params;

    const trades = [];
    let position = null;      // 'long' | 'short' | null
    let trailingLevel = null;
    let highestPrice = -Infinity;
    let lowestPrice = Infinity;

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);

    if (candles.length < spanPeriod) {
        console.warn("[Ichimoku] Not enough candles to calculate Ichimoku Cloud.");
        return [];
    }

    const ichimokuValues = IchimokuCloud.calculate({
        high: highs,
        low: lows,
        conversionPeriod,
        basePeriod,
        spanPeriod,
        displacement,
    });
    const offset = candles.length - ichimokuValues.length;

    for (let i = 1; i < ichimokuValues.length; i++) {
        const idx = i + offset;
        const prev = ichimokuValues[i - 1];
        const current = ichimokuValues[i];
        const price = closes[idx];
        const high = highs[idx];
        const low = lows[idx];
        const time = new Date(candles[idx][0]);

        const isAboveCloud = price > current.spanA && price > current.spanB;
        const isBelowCloud = price < current.spanA && price < current.spanB;

        // --- Handle existing position ---
        if (position) {
            const lastTrade = trades[trades.length - 1];

            // LONG
            if (position === "long") {
                highestPrice = Math.max(highestPrice, price);
                if (trailingStop > 0) trailingLevel = highestPrice * (1 - trailingStop / 100);

                if (SL > 0 && low <= lastTrade.entryPrice * (1 - SL / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 - SL / 100);
                } else if (TP > 0 && price >= lastTrade.entryPrice * (1 + TP / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 + TP / 100);
                } else if (trailingLevel && price <= trailingLevel) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = trailingLevel;
                } else if (prev.conversion > prev.base && current.conversion <= current.base) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = price;
                }

                if (lastTrade.exitTime) {
                    lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
                    lastTrade.returnPct = ((lastTrade.profit / lastTrade.entryPrice) * 100).toFixed(2);
                    lastTrade.duration = `${Math.round((lastTrade.exitTime - lastTrade.entryTime) / (1000 * 60))} min`;
                    lastTrade.exitReason = lastTrade.exitPrice === price ? "Ichimoku Exit"
                        : lastTrade.exitPrice === trailingLevel ? "Trailing Stop"
                        : lastTrade.exitPrice === lastTrade.entryPrice * (1 + TP / 100) ? "Take Profit"
                        : "Stop Loss";

                    position = null;
                    trailingLevel = null;
                    highestPrice = -Infinity;
                    continue;
                }
            }

            // SHORT
            if (position === "short") {
                lowestPrice = Math.min(lowestPrice, price);
                if (trailingStop > 0) trailingLevel = lowestPrice * (1 + trailingStop / 100);

                if (SL > 0 && high >= lastTrade.entryPrice * (1 + SL / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 + SL / 100);
                } else if (TP > 0 && price <= lastTrade.entryPrice * (1 - TP / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 - TP / 100);
                } else if (trailingLevel && price >= trailingLevel) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = trailingLevel;
                } else if (prev.conversion < prev.base && current.conversion >= current.base) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = price;
                }

                if (lastTrade.exitTime) {
                    lastTrade.profit = (lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
                    lastTrade.returnPct = ((lastTrade.profit / lastTrade.entryPrice) * 100).toFixed(2);
                    lastTrade.duration = `${Math.round((lastTrade.exitTime - lastTrade.entryTime) / (1000 * 60))} min`;
                    lastTrade.exitReason = lastTrade.exitPrice === price ? "Ichimoku Exit"
                        : lastTrade.exitPrice === trailingLevel ? "Trailing Stop"
                        : lastTrade.exitPrice === lastTrade.entryPrice * (1 - TP / 100) ? "Take Profit"
                        : "Stop Loss";

                    position = null;
                    trailingLevel = null;
                    lowestPrice = Infinity;
                    continue;
                }
            }
        }

        // --- Entry Logic ---
        if (!position) {
            if (prev.conversion < prev.base && current.conversion >= current.base && isAboveCloud) {
                position = "long";
                highestPrice = price;
                trailingLevel = trailingStop > 0 ? price * (1 - trailingStop / 100) : null;
                trades.push({ entryTime: time, entryPrice: price, signal: "buy", position, size: tradeSize });
            } else if (prev.conversion > prev.base && current.conversion <= current.base && isBelowCloud) {
                position = "short";
                lowestPrice = price;
                trailingLevel = trailingStop > 0 ? price * (1 + trailingStop / 100) : null;
                trades.push({ entryTime: time, entryPrice: price, signal: "sell", position, size: tradeSize });
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
