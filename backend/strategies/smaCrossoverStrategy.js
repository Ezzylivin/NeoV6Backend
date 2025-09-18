import { SMA } from 'technicalindicators';

export const smaCrossoverStrategy = (candles, params) => {
    const trades = [];
    const closes = candles.map(c => c[4]);
    const { shortPeriod, longPeriod } = params;

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

        if (!position && prevShortMA <= prevLongMA && currentShortMA > currentLongMA) {
            // Buy signal: fast MA crosses above slow MA
            position = { entryPrice: currentPrice, entryTimestamp: new Date(candles[i][0]) };
        } else if (position && prevShortMA >= prevLongMA && currentShortMA < currentLongMA) {
            // Sell signal: fast MA crosses below slow MA
            const profit = currentPrice - position.entryPrice;
            trades.push({
                entryPrice: position.entryPrice,
                entryTimestamp: position.entryTimestamp,
                exitPrice: currentPrice,
                exitTimestamp: new Date(candles[i][0]),
                profit: profit,
                positionType: 'long',
            });
            position = null;
        }
    }
    return trades;
};
