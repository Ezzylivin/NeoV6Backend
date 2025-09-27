// File: backend/strategies/atrStrategy.js
// UPGRADED: ATR Volatility Breakout strategy with Stop Loss, Take Profit, and Trailing Stop support.

import { ATR } from "technicalindicators";

export function atrStrategy(candles, params) {
    // --- Parameters with defaults ---
    const {
        atrPeriod = 14,
        atrMultiplier = 2.0,
        tradeSize = 1,
        SL = 0,            // % stop loss (e.g. 3 means 3%)
        TP = 0,            // % take profit (e.g. 10 means 10%)
        trailingStop = 0,  // % trailing stop (ignored if <= 0)
    } = params;

    const trades = [];
    let position = null; // 'long', 'short', or null
    let trailingLevel = null; // dynamic trailing stop price

    // Prepare input arrays
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const closes = candles.map(c => c[4]);

    if (candles.length < atrPeriod) {
        console.log("Not enough candle data for ATR calculation.");
        return [];
    }

    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });
    const atrOffset = candles.length - atrValues.length;

    for (let i = 1; i < atrValues.length; i++) {
        const candleIndex = i + atrOffset;
        const prevClose = closes[candleIndex - 1];
        const atr = atrValues[i];

        const upperBand = prevClose + atr * atrMultiplier;
        const lowerBand = prevClose - atr * atrMultiplier;

        const currentHigh = highs[candleIndex];
        const currentLow = lows[candleIndex];
        const currentClose = closes[candleIndex];
        const currentTime = new Date(candles[candleIndex][0]);

        // --- Handle existing position (apply SL/TP/TS) ---
        if (position) {
            const lastTrade = trades[trades.length - 1];

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
                    if (!trailingLevel) {
                        trailingLevel = lastTrade.entryPrice * (1 - trailingStop / 100);
                    }
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
                    if (!trailingLevel) {
                        trailingLevel = lastTrade.entryPrice * (1 + trailingStop / 100);
                    }
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

        // --- Entry logic (ATR breakout bands) ---
        if (currentHigh > upperBand) {
            if (position === "short") {
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTime = currentTime;
                entryTrade.exitPrice = upperBand;
                entryTrade.profit = (entryTrade.entryPrice - entryTrade.exitPrice) * tradeSize;
                position = null;
            }
            if (!position) {
                position = "long";
                trades.push({
                    entryTime: currentTime,
                    entryPrice: upperBand,
                    signal: "buy",
                    position: "long",
                    size: tradeSize,
                });
            }
        } else if (currentLow < lowerBand) {
            if (position === "long") {
                const entryTrade = trades[trades.length - 1];
                entryTrade.exitTime = currentTime;
                entryTrade.exitPrice = lowerBand;
                entryTrade.profit = (entryTrade.exitPrice - entryTrade.entryPrice) * tradeSize;
                position = null;
            }
            if (!position) {
                position = "short";
                trades.push({
                    entryTime: currentTime,
                    entryPrice: lowerBand,
                    signal: "sell",
                    position: "short",
                    size: tradeSize,
                });
            }
        }
    }

    return trades;
}
