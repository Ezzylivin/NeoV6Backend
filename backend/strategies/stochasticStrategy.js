// File: strategies/stochastic.js
import { Stochastic } from "technicalindicators";

/**
 * Stochastic Strategy with Long and Short
 * - Long entry: %K crosses above %D (oversold)
 * - Long exit: %K crosses below %D (overbought)
 * - Short entry: %K crosses below %D (overbought)
 * - Short exit: %K crosses above %D (oversold)
 */
export const stochasticStrategy = (candles, params = {}) => {
  const { kPeriod = 14, dPeriod = 3, overbought = 80, oversold = 20 } = params;

  const trades = [];
  const high = candles.map(c => c[2]);
  const low = candles.map(c => c[3]);
  const close = candles.map(c => c[4]);

  const stochValues = Stochastic.calculate({
    high,
    low,
    close,
    period: kPeriod,
    signalPeriod: dPeriod,
  });

  let position = null;
  const startIndex = kPeriod + dPeriod - 2;

  for (let i = startIndex; i < close.length; i++) {
    const currentStoch = stochValues[i - startIndex];
    const prevStoch = stochValues[i - startIndex - 1];
    const currentPrice = close[i];
    const currentTimestamp = new Date(candles[i][0]);

    if (!prevStoch || !currentStoch) continue;

    // --- LONG ENTRY (oversold cross) ---
    if (!position && prevStoch.k < prevStoch.d && currentStoch.k >= currentStoch.d && currentStoch.k < oversold) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && prevStoch.k > prevStoch.d && currentStoch.k <= currentStoch.d && currentStoch.k > overbought) {
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

    // --- SHORT ENTRY (overbought cross) ---
    else if (!position && prevStoch.k > prevStoch.d && currentStoch.k <= currentStoch.d && currentStoch.k > overbought) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && prevStoch.k < prevStoch.d && currentStoch.k >= currentStoch.d && currentStoch.k < oversold) {
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
