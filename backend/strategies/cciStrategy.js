// File: strategies/cci.js
import { CCI } from "technicalindicators";

/**
 * Commodity Channel Index (CCI) Strategy with Long and Short
 * - Long entry: CCI crosses below oversold level
 * - Long exit: CCI crosses above zero
 * - Short entry: CCI crosses above overbought level
 * - Short exit: CCI crosses below zero
 */
export const cciStrategy = (candles, params = {}) => {
  const { cciPeriod = 20, overbought = 100, oversold = -100 } = params;

  const trades = [];
  const high = candles.map(c => c[2]);
  const low = candles.map(c => c[3]);
  const close = candles.map(c => c[4]);

  const cciValues = CCI.calculate({ high, low, close, period: cciPeriod });
  let position = null;

  for (let i = 1; i < cciValues.length; i++) {
    const currentCci = cciValues[i];
    const prevCci = cciValues[i - 1];
    const currentPrice = close[i + cciPeriod]; // adjust index for CCI offset
    const currentTimestamp = new Date(candles[i + cciPeriod][0]);

    // --- LONG ENTRY ---
    if (!position && prevCci > oversold && currentCci <= oversold) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (position && position.type === "long" && currentCci >= 0) {
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
    else if (!position && prevCci < overbought && currentCci >= overbought) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (position && position.type === "short" && currentCci <= 0) {
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
