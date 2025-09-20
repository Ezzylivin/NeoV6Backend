// File: backend/strategies/smaStrategy.js

// --- Helper function to calculate a Simple Moving Average (SMA) ---
const calculateSMA = (candles, period) => {
    if (candles.length < period) return null;
    const recentCandles = candles.slice(-period);
    const sum = recentCandles.reduce((acc, candle) => acc + candle[4], 0);
    return sum / period;
};

// --- Main SMA Crossover Strategy Logic ---
export function getStrategy(candles, params) {
    const { shortPeriod = 10, longPeriod = 50 } = params;
    const trades = [];
    let position = null;

    console.log(`--- Starting SMA Crossover Backtest ---`);
    console.log(`Parameters: Short Period=${shortPeriod}, Long Period=${longPeriod}`);

    for (let i = longPeriod; i < candles.length; i++) {
        const currentCandles = candles.slice(0, i + 1);
        const fastMA = calculateSMA(currentCandles, shortPeriod);
        const slowMA = calculateSMA(currentCandles, longPeriod);
        
        if (i % 10 === 0) {
            console.log(`Candle #${i}: Fast MA = ${fastMA?.toFixed(2)}, Slow MA = ${slowMA?.toFixed(2)}`);
        }

        if (fastMA === null || slowMA === null) continue;

        if (fastMA > slowMA && position !== 'long') {
            console.log(`✅ BUY SIGNAL @ Candle #${i}: Fast MA (${fastMA.toFixed(2)}) crossed above Slow MA (${slowMA.toFixed(2)})`);
            position = 'long';
            trades.push({
                entryTimestamp: candles[i][0],
                entryPrice: candles[i][4],
                signal: 'buy',
            });
        } else if (fastMA < slowMA && position === 'long') {
            console.log(`❌ SELL SIGNAL @ Candle #${i}: Fast MA (${fastMA.toFixed(2)}) crossed below Slow MA (${slowMA.toFixed(2)})`);
            position = null;
            const entryTrade = trades[trades.length - 1];
            entryTrade.exitTimestamp = candles[i][0];
            entryTrade.exitPrice = candles[i][4];
            entryTrade.profit = entryTrade.exitPrice - entryTrade.entryPrice;
        }
    }

    console.log(`--- Backtest Finished: Total trades generated = ${trades.length} ---`);
    return trades;
}

