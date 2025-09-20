// File: strategies/macd.js
import { MACD } from "technicalindicators";

/**
 * MACD Strategy with Long and Short
 * - Long entry: MACD line crosses above signal line
 * - Long exit: MACD line crosses below signal line
 * - Short entry: MACD line crosses below signal line
 * - Short exit: MACD line crosses above signal line
 */
export const macdStrategy = (candles, params = {}) => {
  const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9, SimpleMAOscillator = false, SimpleMASignal = false } = params;

  const trades = [];
  const close = candles.map(c => c[4]);

  const macd = MACD.calculate({
    values: close,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator,
    SimpleMASignal,
  });

  let position = null;

  for (let i = 1; i < macd.length; i++) {
    const prevMACD = macd[i - 1];
    const currentMACD = macd[i];
    const currentPrice = close[i + slowPeriod - 1]; // adjust index due to indicator lag
    const currentTimestamp = new Date(candles[i + slowPeriod - 1][0]);

    if (!prevMACD || !currentMACD) continue;

    // --- LONG ENTRY ---
    if (!position && prevMACD.MACD <= prevMACD.signal && currentMACD.MACD > currentMACD.signal) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && prevMACD.MACD >= prevMACD.signal && currentMACD.MACD < currentMACD.signal) {
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
    else if (!position && prevMACD.MACD >= prevMACD.signal && currentMACD.MACD < currentMACD.signal) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && prevMACD.MACD <= prevMACD.signal && currentMACD.MACD > currentMACD.signal) {
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
