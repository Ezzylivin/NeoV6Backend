// File: strategies/bollingerbands.js
import { BollingerBands } from "technicalindicators";

/**
 * Bollinger Bands Strategy with Long and Short
 * - Buys when price drops below lower band
 * - Sells when price rises above upper band
 * - Short trades: sells when price rises above upper band, covers when price drops below lower band
 */
export const bollingerBandsStrategy = (candles, params = {}) => {
  const { period = 20, numStdDev = 2 } = params;

  const trades = [];
  const closes = candles.map(c => c[4]);

  const bbands = BollingerBands.calculate({ values: closes, period, stdDev: numStdDev });
  const startIndex = period - 1;

  let position = null;

  for (let i = startIndex; i < closes.length; i++) {
    const currentPrice = closes[i];
    const currentTimestamp = new Date(candles[i][0]);
    const currentBands = bbands[i - startIndex];

    if (!currentBands) continue;

    // --- LONG ENTRY ---
    if (!position && currentPrice < currentBands.lower) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && currentPrice > currentBands.middle) {
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
    else if (!position && currentPrice > currentBands.upper) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && currentPrice < currentBands.middle) {
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
