import { ATR } from 'technicalindicators';

export const atrStrategy = (candles, params) => {
    // Note: ATR is primarily a risk management tool, not a direct signal generator.
    // This strategy is a simple example for demonstration purposes.
    const trades = [];
    const high = candles.map(c => c[2]);
    const low = candles.map(c => c[3]);
    const close = candles.map(c => c[4]);
    const { atrPeriod, atrMultiplier = 2 } = params;

    const atr = ATR.calculate({ high, low, close, period: atrPeriod });
    const atrStartIndex = atrPeriod - 1;

    let position = null;

    for (let i = atrStartIndex + 1; i < closes.length; i++) {
        const currentAtr = atr[i - atrStartIndex - 1];
        const currentPrice = closes[i];
        const currentTimestamp = new Date(candles[i][0]);

        if (!position && currentPrice > closes[i-1] + currentAtr * atrMultiplier) {
            // Example buy signal: price moves up significantly (e.g., a volatility breakout)
            position = { entryPrice: currentPrice, entryTimestamp: currentTimestamp };
        } else if (position && currentPrice < position.entryPrice - currentAtr * atrMultiplier) {
            // Example sell signal (stop loss based on ATR)
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
