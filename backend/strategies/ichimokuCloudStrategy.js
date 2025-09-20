// File: strategies/ichimokuCloud.js
import { IchimokuCloud } from "technicalindicators";

/**
 * Ichimoku Cloud Strategy with Long and Short
 * - Long entry: Price above cloud + Conversion line crosses above Base line
 * - Long exit: Price drops below cloud or Conversion crosses below Base line
 * - Short entry: Price below cloud + Conversion line crosses below Base line
 * - Short exit: Price rises above cloud or Conversion crosses above Base line
 */
export const ichimokuCloudStrategy = (candles, params = {}) => {
  const {
    conversionLinePeriod = 9,
    baseLinePeriod = 26,
    laggingSpanPeriod = 52,
    cloudSpanPeriod = 26,
  } = params;

  const trades = [];
  const high = candles.map(c => c[2]);
  const low = candles.map(c => c[3]);
  const close = candles.map(c => c[4]);

  const ichimoku = IchimokuCloud.calculate({
    high,
    low,
    close,
    conversionPeriod: conversionLinePeriod,
    basePeriod: baseLinePeriod,
    spanPeriod: laggingSpanPeriod,
    displacement: cloudSpanPeriod,
  });

  let position = null;
  const startIndex = Math.max(conversionLinePeriod, baseLinePeriod, laggingSpanPeriod, cloudSpanPeriod);

  for (let i = startIndex; i < close.length; i++) {
    const currentPrice = close[i];
    const currentIchimoku = ichimoku[i - startIndex];
    const prevIchimoku = ichimoku[i - startIndex - 1];
    const currentTimestamp = new Date(candles[i][0]);

    if (!prevIchimoku || !currentIchimoku) continue;

    // --- LONG ENTRY ---
    if (
      !position &&
      currentPrice > currentIchimoku.senkouA &&
      currentPrice > currentIchimoku.senkouB &&
      prevIchimoku.conversion <= prevIchimoku.base &&
      currentIchimoku.conversion > currentIchimoku.base
    ) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "long" };
    }
    // --- LONG EXIT ---
    else if (
      position &&
      position.type === "long" &&
      (currentPrice < currentIchimoku.senkouA || currentPrice < currentIchimoku.senkouB ||
        (prevIchimoku.conversion >= prevIchimoku.base && currentIchimoku.conversion < currentIchimoku.base))
    ) {
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
    else if (
      !position &&
      currentPrice < currentIchimoku.senkouA &&
      currentPrice < currentIchimoku.senkouB &&
      prevIchimoku.conversion >= prevIchimoku.base &&
      currentIchimoku.conversion < currentIchimoku.base
    ) {
      position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp, type: "short" };
    }
    // --- SHORT EXIT ---
    else if (
      position &&
      position.type === "short" &&
      (currentPrice > currentIchimoku.senkouA || currentPrice > currentIchimoku.senkouB ||
        (prevIchimoku.conversion <= prevIchimoku.base && currentIchimoku.conversion > currentIchimoku.base))
    ) {
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
