import { PSAR } from 'technicalindicators';

export const parabolicSARStrategy = (candles, params) => {
    const trades = [];
    const high = candles.map(c => c[2]);
    const low = candles.map(c => c[3]);
    const { accelerationFactorStart, accelerationFactorIncrement, accelerationFactorMaximum } = params;

    const psar = PSAR.calculate({
        high, low,
        step: accelerationFactorIncrement,
        max: accelerationFactorMaximum,
    });

    let position = null;
    const startIndex = psar.findIndex(val => val !== null);

    for (let i = startIndex; i < psar.length; i++) {
        const currentPsar = psar[i];
        const prevPsar = psar[i - 1];
        const currentPrice = candles[i][4];
        const currentTimestamp = new Date(candles[i][0]);

        if (prevPsar !== null && currentPsar !== null) {
            if (!position && prevPsar > currentPrice && currentPsar <= currentPrice) {
                // Buy signal: PSAR flips from above to below the price
                position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
            } else if (position && prevPsar < currentPrice && currentPsar >= currentPrice) {
                // Sell signal: PSAR flips from below to above the price
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
