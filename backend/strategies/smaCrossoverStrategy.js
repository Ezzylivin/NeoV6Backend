// File: strategies/smaCrossover.js
import { SMA } from "technicalindicators";

/**
 * SMA Crossover Strategy with Long and Short
 * - Long entry: Short-term SMA crosses above long-term SMA
 * - Long exit: Short-term SMA crosses below long-term SMA
 * - Short entry: Short-term SMA crosses below long-term SMA
 * - Short exit: Short-term SMA crosses above long-term SMA
 */
export const smaCrossoverStrategy = (candles, params = {}) => {
  const { shortPeriod = 10, longPeriod = 50 } = params;

  const trades = [];
  const closes = candles.map(c => c[4]);

  const shortMA = SMA.calculate({ values: closes, period: shortPeriod });
  const longMA = SMA.calculate({ values: closes, period: longPeriod });

  let position = null;
  const startIndex = longPeriod > shortPeriod ? longPeriod : shortPeriod;

  for (let i = startIndex; i < closes.length; i++) {
    const currentPrice = closes[i];
    const prevShortMA = shortMA[i - 1];
    const currentShortMA = shortMA[i];
    const prevLongMA = longMA[i - 1];
    const currentLongMA = longMA[i];
    const currentTimestamp = new Date(candles[i][0]);

    // --- LONG ENTRY ---
    if (!position && prevShortMA <= prevLongMA && currentShortMA > currentLongMA) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && prevShortMA >= prevLongMA && currentShortMA < currentLongMA) {
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
    else if (!position && prevShortMA >= prevLongMA && currentShortMA < currentLongMA) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && prevShortMA <= prevLongMA && currentShortMA > currentLongMA) {
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
