import { RSI } from 'technicalindicators';

export const rsiStrategy = (candles, params) => {
    const trades = [];
    const closes = candles.map(c => c[4]);
    const { rsiPeriod, overbought = 70, oversold = 30 } = params;

    const rsi = RSI.calculate({ values: closes, period: rsiPeriod });
    let position = null;

    for (let i = rsiPeriod; i < closes.length; i++) {
        const currentRSI = rsi[i - rsiPeriod];
        const prevRSI = rsi[i - rsiPeriod - 1];
        const currentPrice = closes[i];
        const currentTimestamp = new Date(candles[i][0]);

        if (!position && prevRSI > oversold && currentRSI <= oversold) {
            // Buy signal: RSI crosses below oversold level
            position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
        } else if (position && prevRSI < overbought && currentRSI >= overbought) {
            // Sell signal: RSI crosses above overbought level
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
