// File: backend/strategies/bollingerBandsStrategy.js
// HYBRID UPGRADE: Bollinger Bands Mean Reversion strategy with SL, TP, and trailing stop.

import { BollingerBands } from "technicalindicators";

export function bollingerBandsStrategy(candles, params = {}) {
    const {
        period = 20,
        stdDev = 2,
        tradeSize = 1,
        SL = 0,            // % stop loss
        TP = 0,            // % take profit
        trailingStop = 0,  // % trailing stop
    } = params;

    const trades = [];
    let position = null;       // 'long' | 'short' | null
    let trailingLevel = null;  // dynamic trailing stop
    let highestPrice = -Infinity;
    let lowestPrice = Infinity;

    const closes = candles.map(c => c[4]);
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);

    if (closes.length < period) {
        console.warn("[BollingerBands] Not enough candles to calculate bands.");
        return [];
    }

    const bbValues = BollingerBands.calculate({ period, values: closes, stdDev });
    const offset = closes.length - bbValues.length;

    for (let i = 0; i < bbValues.length; i++) {
        const idx = i + offset;
        const price = closes[idx];
        const { upper, lower } = bbValues[i];
        const time = new Date(candles[idx][0]);

        // --- Handle existing position ---
        if (position) {
            const lastTrade = trades[trades.length - 1];

            // LONG
            if (position === "long") {
                highestPrice = Math.max(highestPrice, price);

                // Update trailing stop
                if (trailingStop > 0) trailingLevel = highestPrice * (1 - trailingStop / 100);

                // Stop Loss
                if (SL > 0 && lows[idx] <= lastTrade.entryPrice * (1 - SL / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 - SL / 100);
                }
                // Take Profit
                else if (TP > 0 && highs[idx] >= lastTrade.entryPrice * (1 + TP / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 + TP / 100);
                }
                // Trailing Stop
                else if (trailingLevel && lows[idx] <= trailingLevel) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = trailingLevel;
                }
                // Band Exit
                else if (price >= upper) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = price;
                }

                if (lastTrade.exitTime) {
                    lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
                    lastTrade.returnPct = ((lastTrade.profit / lastTrade.entryPrice) * 100).toFixed(2);
                    lastTrade.duration = `${Math.round((lastTrade.exitTime - lastTrade.entryTime) / (1000 * 60))} min`;
                    lastTrade.exitReason = lastTrade.exitPrice === price ? "Band Exit"
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

                if (SL > 0 && highs[idx] >= lastTrade.entryPrice * (1 + SL / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 + SL / 100);
                }
                else if (TP > 0 && lows[idx] <= lastTrade.entryPrice * (1 - TP / 100)) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 - TP / 100);
                }
                else if (trailingLevel && highs[idx] >= trailingLevel) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = trailingLevel;
                }
                else if (price <= lower) {
                    lastTrade.exitTime = time;
                    lastTrade.exitPrice = price;
                }

                if (lastTrade.exitTime) {
                    lastTrade.profit = (lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
                    lastTrade.returnPct = ((lastTrade.profit / lastTrade.entryPrice) * 100).toFixed(2);
                    lastTrade.duration = `${Math.round((lastTrade.exitTime - lastTrade.entryTime) / (1000 * 60))} min`;
                    lastTrade.exitReason = lastTrade.exitPrice === price ? "Band Exit"
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

        // --- Entry logic ---
        if (!position) {
            if (price <= lower) {
                position = "long";
                highestPrice = price;
                trailingLevel = trailingStop > 0 ? price * (1 - trailingStop / 100) : null;
                trades.push({ entryTime: time, entryPrice: price, signal: "buy", position, size: tradeSize });
            } else if (price >= upper) {
                position = "short";
                lowestPrice = price;
                trailingLevel = trailingStop > 0 ? price * (1 + trailingStop / 100) : null;
                trades.push({ entryTime: time, entryPrice: price, signal: "sell", position, size: tradeSize });
            }
        }
    }

    // --- Close any open trade at the last candle ---
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
