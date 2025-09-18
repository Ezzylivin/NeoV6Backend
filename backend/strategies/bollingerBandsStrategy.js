import { BollingerBands } from 'technicalindicators';

export const bollingerBandsStrategy = (candles, params) => {
    const trades = [];
    const closes = candles.map(c => c[4]);
    const { period, numStdDev } = params;

    const bbands = BollingerBands.calculate({ values: closes, period, stdDev: numStdDev });
    let position = null;
    const startIndex = period - 1;

    for (let i = startIndex; i < closes.length; i++) {
        const currentBbands = bbands[i - startIndex];
        const currentPrice = closes[i];
        const currentTimestamp = new Date(candles[i][0]);

        if (!position && currentPrice < currentBbands.lower) {
            // Buy signal: price drops below the lower band
            position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
        } else if (position && currentPrice > currentBbands.upper) {
            // Sell signal: price crosses above the upper band
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
    return trades;
};
