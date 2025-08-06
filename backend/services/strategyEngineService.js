// File: backend/services/strategyEngine.js

// Calculate the moving average over a given period
const getMovingAverage = (data, period) => {
  if (data.length < period) return null;
  const closes = data.slice(-period).map(c => c[4]); // Close prices
  const sum = closes.reduce((acc, val) => acc + val, 0);
  return sum / period;
};

// Moving Average Crossover Strategy
const crossoverStrategy = (ohlcv) => {
  if (ohlcv.length < 50) return 'HOLD'; // Not enough data

  const fastMA = getMovingAverage(ohlcv, 10);     // 10-period
  const slowMA = getMovingAverage(ohlcv, 30);     // 30-period
  const prevFastMA = getMovingAverage(ohlcv.slice(0, -1), 10);
  const prevSlowMA = getMovingAverage(ohlcv.slice(0, -1), 30);

  if (prevFastMA <= prevSlowMA && fastMA > slowMA) return 'BUY';
  if (prevFastMA >= prevSlowMA && fastMA < slowMA) return 'SELL';
  return 'HOLD';
};

export {
  crossoverStrategy
};
