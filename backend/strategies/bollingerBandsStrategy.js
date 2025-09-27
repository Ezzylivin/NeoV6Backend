// File: backend/strategies/bollingerBandsStrategy.js
// PREMIUM UPGRADE: Bollinger Bands Mean Reversion with SL, TP, and Trailing Stop Loss.

import { BollingerBands } from "technicalindicators";

export function bollingerBandsStrategy(candles, params = {}) {
    const {
        period = 20,
        stdDev = 2,
        tradeSize = 1,
        stopLossPct = null,      // % below entry for SL (e.g. 3 = 3%)
        takeProfitPct = null,    // % above entry for TP (e.g. 10 = 10%)
        trailingStopPct = null   // % trailing stop (e.g. 2 = 2%)
    } = params;

    const trades = [];
    let position = null; 
    let trailingStop = null;
    let highestPrice = -Infinity;
    let lowestPrice = Infinity;

    const closes = candles.map(c => c[4]);
    if (closes.length < period) {
        console.warn("[BollingerBands] Not enough candles to calculate bands.");
        return [];
    }

    const bbValues = BollingerBands.calculate({ period, values: closes, stdDev });
    const bbOffset = closes.length - bbValues.length;

    for (let i = 0; i < bbValues.length; i++) {
        const idx = i + bbOffset;
        const price = closes[idx];
        const { upper, lower } = bbValues[i];
        const time = new Date(candles[idx][0]);

        // --- LONG ENTRY ---
        if (!position && price <= lower) {
            position = "long";
            highestPrice = price;
            trailingStop = trailingStopPct ? price * (1 - trailingStopPct / 100) : null;
            trades.push({
                entryTime: time,
                entryPrice: price,
                signal: "buy",
                position,
                size: tradeSize,
            });
        }

        // --- SHORT ENTRY ---
        else if (!position && price >= upper) {
            position = "short";
            lowestPrice = price;
            trailingStop = trailingStopPct ? price * (1 + trailingStopPct / 100) : null;
            trades.push({
                entryTime: time,
                entryPrice: price,
                signal: "sell",
                position,
                size: tradeSize,
            });
        }

        // --- EXIT LOGIC ---
        else if (position) {
            const entryTrade = trades[trades.length - 1];
            const entryPrice = entryTrade.entryPrice;

            let exitReason = null;

            if (position === "long") {
                highestPrice = Math.max(highestPrice, price);
                if (trailingStopPct) {
                    trailingStop = highestPrice * (1 - trailingStopPct / 100);
                }

                if (stopLossPct && price <= entryPrice * (1 - stopLossPct / 100)) {
                    exitReason = "Stop Loss";
                } else if (takeProfitPct && price >= entryPrice * (1 + takeProfitPct / 100)) {
                    exitReason = "Take Profit";
                } else if (trailingStop && price <= trailingStop) {
                    exitReason = "Trailing Stop";
                } else if (price >= upper) {
                    exitReason = "Band Exit";
                }
            }

            else if (position === "short") {
                lowestPrice = Math.min(lowestPrice, price);
                if (trailingStopPct) {
                    trailingStop = lowestPrice * (1 + trailingStopPct / 100);
                }

                if (stopLossPct && price >= entryPrice * (1 + stopLossPct / 100)) {
                    exitReason = "Stop Loss";
                } else if (takeProfitPct && price <= entryPrice * (1 - takeProfitPct / 100)) {
                    exitReason = "Take Profit";
                } else if (trailingStop && price >= trailingStop) {
                    exitReason = "Trailing Stop";
                } else if (price <= lower) {
                    exitReason = "Band Exit";
                }
            }

            if (exitReason) {
                entryTrade.exitTime = time;
                entryTrade.exitPrice = price;
                entryTrade.exitReason = exitReason;

                if (position === "long") {
                    entryTrade.profit = (price - entryPrice) * tradeSize;
                } else {
                    entryTrade.profit = (entryPrice - price) * tradeSize;
                }

                entryTrade.returnPct = ((entryTrade.profit / entryPrice) * 100).toFixed(2);
                entryTrade.duration = `${Math.round(
                    (entryTrade.exitTime - entryTrade.entryTime) / (1000 * 60)
                )} min`;

                position = null;
                trailingStop = null;
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

            if (position === "long") {
                lastTrade.profit = (lastTrade.exitPrice - lastTrade.entryPrice) * tradeSize;
            } else {
                lastTrade.profit = (lastTrade.entryPrice - lastTrade.exitPrice) * tradeSize;
            }

            lastTrade.returnPct = ((lastTrade.profit / lastTrade.entryPrice) * 100).toFixed(2);
            lastTrade.duration = `${Math.round(
                (lastTrade.exitTime - lastTrade.entryTime) / (1000 * 60)
            )} min`;

            lastTrade.exitReason = "End of Data";
        }
    }

    return trades;
}
