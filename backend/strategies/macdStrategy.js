import { MACD } from 'technicalindicators';

export const macdStrategy = (candles, params) => {
    const trades = [];
    const closes = candles.map(c => c[4]);
    const { fastPeriod, slowPeriod, signalPeriod } = params;

    const macd = MACD.calculate({
        values: closes, fastPeriod, slowPeriod, signalPeriod,
        SimpleMAOscillator: false, SimpleMASignal: false
    });

    let position = null;
    const startIndex = slowPeriod + signalPeriod - 2;

    for (let i = startIndex; i < closes.length; i++) {
        const currentMacd = macd[i - startIndex];
        const prevMacd = macd[i - startIndex - 1];
        const currentPrice = closes[i];
        const currentTimestamp = new Date(candles[i][0]);

        if (prevMacd && currentMacd) {
            if (!position && prevMacd.MACD < prevMacd.signal && currentMacd.MACD >= currentMacd.signal) {
                // Buy signal: MACD line crosses above Signal line
                position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
            } else if (position && prevMacd.MACD > prevMacd.signal && currentMacd.MACD <= currentMacd.signal) {
                // Sell signal: MACD line crosses below Signal line
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
