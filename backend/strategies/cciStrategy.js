import { CCI } from 'technicalindicators';

export const cciStrategy = (candles, params) => {
    const trades = [];
    const high = candles.map(c => c[2]);
    const low = candles.map(c => c[3]);
    const close = candles.map(c => c[4]);
    const { cciPeriod, overbought = 100, oversold = -100 } = params;

    const cci = CCI.calculate({ high, low, close, period: cciPeriod });
    let position = null;

    for (let i = cciPeriod; i < cci.length; i++) {
        const currentCci = cci[i - cciPeriod];
        const prevCci = cci[i - cciPeriod - 1];
        const currentPrice = close[i];
        const currentTimestamp = new Date(candles[i][0]);

        if (prevCci !== null && currentCci !== null) {
            if (!position && prevCci > oversold && currentCci <= oversold) {
                // Buy signal: CCI crosses below oversold level
                position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
            } else if (position && prevCci < overbought && currentCci >= overbought) {
                // Sell signal: CCI crosses above overbought level
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
