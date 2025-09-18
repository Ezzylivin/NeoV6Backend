import { OBV, SMA } from 'technicalindicators';

export const onBalanceVolumeStrategy = (candles, params) => {
    const trades = [];
    const closes = candles.map(c => c[4]);
    const volumes = candles.map(c => c[5]);
    const { obvPeriod } = params;

    const obvValues = OBV.calculate({ values: closes, volume: volumes });
    const obvMA = SMA.calculate({ values: obvValues, period: obvPeriod });

    let position = null;
    const startIndex = obvPeriod - 1;

    for (let i = startIndex; i < obvMA.length; i++) {
        const currentObv = obvValues[i];
        const prevObv = obvValues[i - 1];
        const currentObvMA = obvMA[i - startIndex];
        const prevObvMA = obvMA[i - startIndex - 1];
        const currentPrice = closes[i];
        const currentTimestamp = new Date(candles[i][0]);

        if (prevObvMA && currentObvMA) {
            if (!position && prevObv > prevObvMA && currentObv <= currentObvMA) {
                // Buy signal: OBV line crosses below its moving average (divergence)
                position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
            } else if (position && prevObv < prevObvMA && currentObv >= currentObvMA) {
                // Sell signal: OBV line crosses above its moving average (divergence)
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
