// File: backend/strategies/strategyManager.js
// NEW: Defines and manages all available trading strategies.

import technicalindicators from 'technicalindicators';

// --- RSI Strategy ---
const rsiStrategy = (candles, params) => {
    const trades = [];
    const closes = candles.map(c => c[4]); // Index 4 is closing price
    const { rsiPeriod = 14, overbought = 70, oversold = 30 } = params;
    
    const rsi = technicalindicators.RSI.calculate({ values: closes, period: rsiPeriod });
    let position = null;

    for (let i = 1; i < rsi.length; i++) {
        const currentCandle = candles[i + rsiPeriod];
        if (!currentCandle) continue;

        if (!position && rsi[i-1] > oversold && rsi[i] <= oversold) { // Buy signal
            position = { entryPrice: currentCandle[4], entryTimestamp: new Date(currentCandle[0]) };
        } else if (position && rsi[i-1] < overbought && rsi[i] >= overbought) { // Sell signal
            trades.push({ timestamp: new Date(currentCandle[0]), profit: currentCandle[4] - position.entryPrice });
            position = null;
        }
    }
    return trades;
};

// --- MACD Strategy ---
const macdStrategy = (candles, params) => {
    const trades = [];
    const closes = candles.map(c => c[4]);
    const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9 } = params;

    const macd = technicalindicators.MACD.calculate({
        values: closes, fastPeriod, slowPeriod, signalPeriod,
        SimpleMAOscillator: false, SimpleMASignal: false
    });

    let position = null;
    const dataStartIndex = slowPeriod - 1 + signalPeriod -1;

    for (let i = 1; i < macd.length; i++) {
        const currentCandle = candles[i + dataStartIndex];
        if (!currentCandle) continue;
        
        // Buy Signal: MACD line crosses above Signal line
        if (!position && macd[i-1].MACD < macd[i-1].signal && macd[i].MACD > macd[i].signal) {
            position = { entryPrice: currentCandle[4], entryTimestamp: new Date(currentCandle[0]) };
        }
        // Sell Signal: MACD line crosses below Signal line
        else if (position && macd[i-1].MACD > macd[i-1].signal && macd[i].MACD < macd[i].signal) {
            trades.push({ timestamp: new Date(currentCandle[0]), profit: currentCandle[4] - position.entryPrice });
            position = null;
        }
    }
    return trades;
};

// --- Strategy Map ---
const strategies = {
    RSI: rsiStrategy,
    MACD: macdStrategy,
    // You can add more strategies here
};

// Export a function to get the correct strategy logic
export const getStrategy = (strategyType) => {
    const strategy = strategies[strategyType];
    if (!strategy) {
        throw new Error(`Strategy type '${strategyType}' is not supported.`);
    }
    return strategy;
};
