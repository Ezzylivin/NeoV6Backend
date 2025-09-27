// File: backend/strategies/atrStrategy.js
// HYBRID UPGRADE: ATR Volatility Breakout strategy with realistic SL, TP, and trailing stop.

import { ATR } from "technicalindicators";

export function atrStrategy(candles, params = {}) {
    // --- Parameters with defaults ---
    const {
        atrPeriod = 14,
        atrMultiplier = 2.0,
        tradeSize = 1,
        SL = 0,            // % stop loss
        TP = 0,            // % take profit
        trailingStop = 0,  // % trailing stop
    } = params;

    const trades = [];
    let position = null;        // 'long' | 'short' | null
    let trailingLevel = null;   // Dynamic trailing stop

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);

    if (candles.length < atrPeriod) {
        console.warn("[ATR] Not enough candles for ATR calculation.");
        return [];
    }

    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });
    const offset = candles.length - atrValues.length;

    for (let i = 1; i < atrValues.length; i++) {
        const idx = i + offset;
        const prevClose = closes[idx - 1];
        const atr = atrValues[i];

        const upperBand = prevClose + atr * atrMultiplier;
        const lowerBand = prevClose - atr * atrMultiplier;

        const currentHigh = highs[idx];
        const currentLow = lows[idx];
        const currentClose = closes[idx];
        const currentTime = new Date(candles[idx][0]);

        // --- Handle existing position ---
        if (position) {
            const lastTrade = trades[trades.length - 1];

            // LONG
            if (position === "long") {
                // Stop Loss
                if (SL > 0 && currentLow <= lastTrade.entryPrice * (1 - SL / 100)) {
                    lastTrade.exitTime = currentTime;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 - SL / 100);
                    lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
                    position = null;
                    trailingLevel = null;
                    continue;
                }
                // Take Profit
                if (TP > 0 && currentHigh >= lastTrade.entryPrice * (1 + TP / 100)) {
                    lastTrade.exitTime = currentTime;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 + TP / 100);
                    lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
                    position = null;
                    trailingLevel = null;
                    continue;
                }
                // Trailing Stop
                if (trailingStop > 0) {
                    if (!trailingLevel) trailingLevel = lastTrade.entryPrice * (1 - trailingStop / 100);
                    if (currentClose > lastTrade.entryPrice) {
                        trailingLevel = Math.max(trailingLevel, currentClose * (1 - trailingStop / 100));
                    }
                    if (currentLow <= trailingLevel) {
                        lastTrade.exitTime = currentTime;
                        lastTrade.exitPrice = trailingLevel;
                        lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
                        position = null;
                        trailingLevel = null;
                        continue;
                    }
                }
            }

            // SHORT
            if (position === "short") {
                // Stop Loss
                if (SL > 0 && currentHigh >= lastTrade.entryPrice * (1 + SL / 100)) {
                    lastTrade.exitTime = currentTime;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 + SL / 100);
                    lastTrade.profit = (lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
                    position = null;
                    trailingLevel = null;
                    continue;
                }
                // Take Profit
                if (TP > 0 && currentLow <= lastTrade.entryPrice * (1 - TP / 100)) {
                    lastTrade.exitTime = currentTime;
                    lastTrade.exitPrice = lastTrade.entryPrice * (1 - TP / 100);
                    lastTrade.profit = (lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
                    position = null;
                    trailingLevel = null;
                    continue;
                }
                // Trailing Stop
                if (trailingStop > 0) {
                    if (!trailingLevel) trailingLevel = lastTrade.entryPrice * (1 + trailingStop / 100);
                    if (currentClose < lastTrade.entryPrice) {
                        trailingLevel = Math.min(trailingLevel, currentClose * (1 + trailingStop / 100));
                    }
                    if (currentHigh >= trailingLevel) {
                        lastTrade.exitTime = currentTime;
                        lastTrade.exitPrice = trailingLevel;
                        lastTrade.profit = (lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
                        position = null;
                        trailingLevel = null;
                        continue;
                    }
                }
            }
        }

        // --- Entry logic ---
        if (currentHigh > upperBand) {
            if (position === "short") {
                const lastTrade = trades[trades.length - 1];
                lastTrade.exitTime = currentTime;
                lastTrade.exitPrice = upperBand;
                lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
                position = null;
            }
            if (!position) {
                position = "long";
                trades.push({
                    entryTime: currentTime,
                    entryPrice: upperBand,
                    signal: "buy",
                    position,
                    size: tradeSize,
                });
            }
        } else if (currentLow < lowerBand) {
            if (position === "long") {
                const lastTrade = trades[trades.length - 1];
                lastTrade.exitTime = currentTime;
                lastTrade.exitPrice = lowerBand;
                lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
                position = null;
            }
            if (!position) {
                position = "short";
                trades.push({
                    entryTime: currentTime,
                    entryPrice: lowerBand,
                    signal: "sell",
                    position,
                    size: tradeSize,
                });
            }
        }
    }

    // --- Safety: close last trade ---
    if (position) {
        const lastTrade = trades[trades.length - 1];
        const lastIdx = closes.length - 1;
        lastTrade.exitTime = new Date(candles[lastIdx][0]);
        lastTrade.exitPrice = closes[lastIdx];
        lastTrade.profit = (position === "long"
            ? lastTrade.exitPrice - lastTrade.entryPrice
            : lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
        position = null;
    }

    return trades;
}
