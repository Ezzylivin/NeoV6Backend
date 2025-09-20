// File: strategies/parabolicSAR.js
import { PSAR } from "technicalindicators";

/**
 * Parabolic SAR Strategy with Long and Short
 * - Long entry: Price crosses above SAR
 * - Long exit: Price crosses below SAR
 * - Short entry: Price crosses below SAR
 * - Short exit: Price crosses above SAR
 */
export const parabolicSARStrategy = (candles, params = {}) => {
  const { step = 0.02, max = 0.2 } = params;

  const trades = [];
  const highs = candles.map(c => c[2]);
  const lows = candles.map(c => c[3]);
  const closes = candles.map(c => c[4]);

  const psarValues = PSAR.calculate({ high: highs, low: lows, step, max });

  let position = null;
  const startIndex = 0;

  for (let i = startIndex; i < psarValues.length; i++) {
    const psar = psarValues[i];
    const prevPrice = closes[i - 1] || closes[i];
    const currentPrice = closes[i];
    const currentTimestamp = new Date(candles[i][0]);

    // --- LONG ENTRY ---
    if (!position && prevPrice <= psar && currentPrice > psar) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && prevPrice >= psar && currentPrice < psar) {
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
    else if (!position && prevPrice >= psar && currentPrice < psar) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && prevPrice <= psar && currentPrice > psar) {
      const profit = position.entryPrice - currentPrice;
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
