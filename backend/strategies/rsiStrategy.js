// File: strategies/rsi.js
import { RSI } from "technicalindicators";

/**
 * RSI Strategy with Long and Short
 * - Long entry: RSI crosses below oversold level (e.g., 30)
 * - Long exit: RSI crosses above overbought level (e.g., 70)
 * - Short entry: RSI crosses above overbought level
 * - Short exit: RSI crosses below oversold level
 */
export const rsiStrategy = (candles, params = {}) => {
  const { rsiPeriod = 14, overbought = 70, oversold = 30 } = params;

  const trades = [];
  const closes = candles.map(c => c[4]);

  const rsiValues = RSI.calculate({ values: closes, period: rsiPeriod });
  let position = null;

  for (let i = rsiPeriod; i < closes.length; i++) {
    const currentRSI = rsiValues[i - rsiPeriod];
    const prevRSI = rsiValues[i - rsiPeriod - 1];
    const currentPrice = closes[i];
    const currentTimestamp = new Date(candles[i][0]);

    // --- LONG ENTRY ---
    if (!position && prevRSI > oversold && currentRSI <= oversold) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && prevRSI < overbought && currentRSI >= overbought) {
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
    else if (!position && prevRSI < overbought && currentRSI >= overbought) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && prevRSI > oversold && currentRSI <= oversold) {
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
