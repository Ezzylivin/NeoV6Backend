import { Stochastic } from 'technicalindicators';

export const stochasticStrategy = (candles, params) => {
    const trades = [];
    const high = candles.map(c => c[2]);
    const low = candles.map(c => c[3]);
    const close = candles.map(c => c[4]);
    const { kPeriod, dPeriod } = params;

    const stoch = Stochastic.calculate({ high, low, close, period: kPeriod, signalPeriod: dPeriod });
    let position = null;
    const startIndex = kPeriod + dPeriod - 2;

    for (let i = startIndex; i < closes.length; i++) {
        const currentStoch = stoch[i - startIndex];
        const prevStoch = stoch[i - startIndex - 1];
        const currentPrice = closes[i];
        const currentTimestamp = new Date(candles[i][0]);

        if (prevStoch && currentStoch) {
            if (!position && prevStoch.k < prevStoch.d && currentStoch.k >= currentStoch.d) {
                // Buy signal: %K crosses above %D
                position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
            } else if (position && prevStoch.k > prevStoch.d && currentStoch.k <= currentStoch.d) {
                // Sell signal: %K crosses below %D
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
