/**
 * Calculates the simple moving average over a given period.
 * Kept as a private helper function.
 * @param {Array<Array<number>>} data - The OHLCV data array.
 * @param {number} period - The number of candles to average.
 * @returns {number|null} The moving average or null if not enough data.
 */
const getMovingAverage = (data, period) => {
  if (data.length < period) return null;
  const closes = data.slice(-period).map(c => c[4]); // Index 4 is the close price
  const sum = closes.reduce((acc, val) => acc + val, 0);
  return sum / period;
};

/**
 * A flexible Moving Average Crossover Strategy Engine.
 * It accepts parameters to define the moving average periods.
 * @param {Array<Array<number>>} ohlcv - The full OHLCV dataset.
 * @param {object} params - The parameters for the strategy.
 * @param {number} params.fastPeriod - The period for the fast moving average.
 * @param {number} params.slowPeriod - The period for the slow moving average.
 * @returns {'BUY'|'SELL'|'HOLD'} The trading decision.
 */
export const crossoverStrategy = (ohlcv, params) => {
  // Use default parameters if none are provided, maintaining original behavior.
  const { fastPeriod = 10, slowPeriod = 30 } = params || {};

  // --- Add Robustness ---
  // 1. Add validation for parameters
  if (fastPeriod >= slowPeriod) {
    // A fast MA can't be slower than or equal to the slow MA for a crossover
    console.error('[StrategyEngine] Invalid parameters: fastPeriod must be less than slowPeriod.');
    return 'HOLD';
  }

  // 2. Make the data check dynamic, based on the longest period needed.
  if (ohlcv.length < slowPeriod) {
    return 'HOLD'; // Not enough data for the slowest MA
  }
  
  // --- Use Parameters Instead of Hardcoded Values ---
  const fastMA = getMovingAverage(ohlcv, fastPeriod);
  const slowMA = getMovingAverage(ohlcv, slowPeriod);
  
  // Get the previous candle's data
  const prevOhlcv = ohlcv.slice(0, -1);
  const prevFastMA = getMovingAverage(prevOhlcv, fastPeriod);
  const prevSlowMA = getMovingAverage(prevOhlcv, slowPeriod);

  // Handle cases where an MA could not be calculated
  if (fastMA === null || slowMA === null || prevFastMA === null || prevSlowMA === null) {
    return 'HOLD';
  }

  // --- The core logic remains the same ---
  if (prevFastMA <= prevSlowMA && fastMA > slowMA) return 'BUY';
  if (prevFastMA >= prevSlowMA && fastMA < slowMA) return 'SELL';
  
  return 'HOLD';
};
