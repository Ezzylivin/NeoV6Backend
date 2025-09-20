// File: strategies/atr.js
import { ATR } from "technicalindicators";

/**
 * ATR Strategy with Long and Short
 * - Uses Average True Range to detect volatility breakouts
 * - Dynamic parameters: atrPeriod, atrMultiplier
 * - Supports long and short trades with stop loss
 */
export const atrStrategy = (candles, params = {}) => {
  const { atrPeriod = 14, atrMultiplier = 2 } = params;

  const trades = [];
  const highs = candles.map(c => c[2]);
  const lows = candles.map(c => c[3]);
  const closes = candles.map(c => c[4]);

  const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });
  const atrStartIndex = atrPeriod - 1;

  let position = null;

  for (let i = atrStartIndex + 1; i < closes.length; i++) {
    const currentAtr = atr[i - atrStartIndex - 1];
    const currentPrice = closes[i];
    const prevPrice = closes[i - 1];
    const currentTimestamp = new Date(candles[i][0]);

    // --- LONG ENTRY ---
    if (!position && currentPrice > prevPrice + currentAtr * atrMultiplier) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && currentPrice < position.entryPrice - currentAtr * atrMultiplier) {
      const profit = currentPrice - position.entryPrice;
      trades.push({
        entryPrice: position.entryPrice,
        entryTimestamp: position.entryTimestamp,
        exitPrice: currentPrice,
        exitTimestamp: currentTimestamp,
        profit,
        positionType: "long",
      });
      position = null;
    }

    // --- SHORT ENTRY ---
    else if (!position && currentPrice < prevPrice - currentAtr * atrMultiplier) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && currentPrice > position.entryPrice + currentAtr * atrMultiplier) {
      const profit = position.entryPrice - currentPrice; // profit for short trade
      trades.push({
        entryPrice: position.entryPrice,
        entryTimestamp: position.entryTimestamp,
        exitPrice: currentPrice,
        exitTimestamp: currentTimestamp,
        profit,
        positionType: "short",
      });
      position = null;
    }
  }

  return trades;
};
