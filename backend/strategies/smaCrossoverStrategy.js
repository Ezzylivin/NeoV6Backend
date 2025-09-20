// File: backend/strategies/smaStrategy.js
// UPGRADED: Added detailed logging to debug trade signal generation.

// --- Helper function to calculate a Simple Moving Average (SMA) ---
const calculateSMA = (candles, period) => {
    // Ensure we have enough data to calculate the SMA
    if (candles.length < period) {
        return null; // Not enough data
    }
    // Get the most recent candles for the calculation
    const recentCandles = candles.slice(-period);
    // Sum the closing prices
    const sum = recentCandles.reduce((acc, candle) => acc + candle[4], 0); // candle[4] is the closing price
    return sum / period;
};

// --- Main SMA Crossover Strategy Logic ---
export function smaStrategy(candles, params) {
    const { shortPeriod = 10, longPeriod = 50 } = params;
    const trades = [];
    let position = null; // Tracks if we are currently in a 'long' or 'short' position

    console.log(`--- Starting SMA Crossover Backtest ---`);
    console.log(`Parameters: Short Period=${shortPeriod}, Long Period=${longPeriod}`);

    // Loop through each candle to generate signals
    for (let i = longPeriod; i < candles.length; i++) {
        const currentCandles = candles.slice(0, i + 1);
        const fastMA = calculateSMA(currentCandles, shortPeriod);
        const slowMA = calculateSMA(currentCandles, longPeriod);
        
        // Log the indicator values for every 10th candle to avoid spamming the console
        if (i % 10 === 0) {
            console.log(`Candle #${i}: Fast MA = ${fastMA?.toFixed(2)}, Slow MA = ${slowMA?.toFixed(2)}`);
        }

        if (fastMA === null || slowMA === null) {
            continue; // Skip if we don't have enough data yet
        }

        // --- Trade Signal Logic ---
        if (fastMA > slowMA && position !== 'long') {
            // "Golden Cross": Fast MA crosses above Slow MA -> Buy signal
            console.log(`✅ BUY SIGNAL @ Candle #${i}: Fast MA (${fastMA.toFixed(2)}) crossed above Slow MA (${slowMA.toFixed(2)})`);
            position = 'long';
            trades.push({
                entryTimestamp: candles[i][0],
                entryPrice: candles[i][4],
                signal: 'buy',
            });
        } else if (fastMA < slowMA && position === 'long') {
            // "Death Cross": Fast MA crosses below Slow MA -> Sell signal
            console.log(`❌ SELL SIGNAL @ Candle #${i}: Fast MA (${fastMA.toFixed(2)}) crossed below Slow MA (${slowMA.toFixed(2)})`);
            position = null; // Close the position
            const entryTrade = trades[trades.length - 1];
            entryTrade.exitTimestamp = candles[i][0];
            entryTrade.exitPrice = candles[i][4];
            entryTrade.profit = entryTrade.exitPrice - entryTrade.entryPrice;
        }
    }

    console.log(`--- Backtest Finished: Total trades generated = ${trades.length} ---`);
    return trades;
}
