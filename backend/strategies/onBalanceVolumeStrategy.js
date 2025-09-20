// File: strategies/onbalancevolume.js
import { OBV, SMA } from "technicalindicators";

/**
 * OBV Strategy with Long and Short
 * - Long entry: OBV line crosses above its moving average
 * - Long exit: OBV line crosses below its moving average
 * - Short entry: OBV line crosses below its moving average
 * - Short exit: OBV line crosses above its moving average
 */
export const onBalanceVolumeStrategy = (candles, params = {}) => {
  const { obvPeriod = 20 } = params;

  const trades = [];
  const closes = candles.map(c => c[4]);
  const volumes = candles.map(c => c[5]);

  const obvValues = OBV.calculate({ values: closes, volume: volumes });
  const obvMA = SMA.calculate({ values: obvValues, period: obvPeriod });

  let position = null;
  const startIndex = obvPeriod;

  for (let i = startIndex; i < obvValues.length; i++) {
    const prevObv = obvValues[i - 1];
    const currentObv = obvValues[i];
    const prevObvMA = obvMA[i - startIndex];
    const currentObvMA = obvMA[i - startIndex + 1] || prevObvMA;
    const currentPrice = closes[i];
    const currentTimestamp = new Date(candles[i][0]);

    // --- LONG ENTRY ---
    if (!position && prevObv <= prevObvMA && currentObv > currentObvMA) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && prevObv >= prevObvMA && currentObv < currentObvMA) {
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
    else if (!position && prevObv >= prevObvMA && currentObv < currentObvMA) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && prevObv <= prevObvMA && currentObv > currentObvMA) {
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
