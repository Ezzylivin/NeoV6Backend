import { IchimokuCloud } from 'technicalindicators';

export const ichimokuCloudStrategy = (candles, params) => {
    const trades = [];
    const high = candles.map(c => c[2]);
    const low = candles.map(c => c[3]);
    const close = candles.map(c => c[4]);
    const { conversionLinePeriod, baseLinePeriod, laggingSpanPeriod, cloudSpanPeriod } = params;

    const ichimoku = IchimokuCloud.calculate({
        high, low, close,
        conversionPeriod: conversionLinePeriod,
        basePeriod: baseLinePeriod,
        spanPeriod: laggingSpanPeriod,
        displacement: cloudSpanPeriod,
    });

    let position = null;
    const startIndex = Math.max(conversionLinePeriod, baseLinePeriod, laggingSpanPeriod, cloudSpanPeriod);

    for (let i = startIndex; i < closes.length; i++) {
        const currentIchimoku = ichimoku[i - startIndex];
        const prevIchimoku = ichimoku[i - startIndex - 1];
        const currentPrice = closes[i];
        const currentTimestamp = new Date(candles[i][0]);

        if (prevIchimoku && currentIchimoku) {
            // Buy signal: Price is above the cloud, and Conversion line crosses above Base line
            if (!position && currentPrice > currentIchimoku.senkouA && currentPrice > currentIchimoku.senkouB &&
                prevIchimoku.conversion <= prevIchimoku.base && currentIchimoku.conversion > currentIchimoku.base) {
                position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
            }
            // Sell signal: Price is below the cloud, and Conversion line crosses below Base line
            else if (position && currentPrice < currentIchimoku.senkouA && currentPrice < currentIchimoku.senkouB &&
                prevIchimoku.conversion >= prevIchimoku.base && currentIchimoku.conversion < currentIchimoku.base) {
                const profit = currentPrice - position.entryPrice;
                trades.push({
                    entryPrice: position.entryPrice,
                    entryTimestamp: position.entryTimestamp,
                    exitPrice: currentPrice,
                    exitTimestamp: currentTimestamp,
                    profit: profit,
                    positionType: 'long',
                });
                position = null;
            }
        }
    }
    return trades;
};
