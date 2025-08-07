import ExchangeService from './exchangeService.js';
import Backtest from '../dbStructure/backtest.js';
import { logToDb } from './logService.js';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

/**
 * Runs a backtest simulation for a given user and stores the results.
 * This is the core logic engine.
 * @param {string} userId - The ID of the user requesting the backtest.
 * @returns {Promise<Array>} A promise that resolves to an array of result objects.
 */
export const runBacktestAndStore = async (userId) => {
  console.log(`[Backtest] Starting across ${TIMEFRAMES.length} timeframes for user ${userId}...`);
  const exchange = new ExchangeService();
  
  // FIX: Use a clear, distinct name for the array of results.
  const allResults = []; 

  for (const timeframe of TIMEFRAMES) {
    const historicalData = await exchange.fetchOHLCV('BTC/USDT', timeframe, 500);
    
    // BEST PRACTICE: Add robustness by handling cases where no data is returned.
    if (!historicalData || historicalData.length === 0) {
      console.log(`[Backtest] No historical data found for ${timeframe}. Skipping.`);
      continue; // Move to the next timeframe
    }

    let balance = 10000;
    let asset = 0;
    let trades = 0;

    for (let i = 0; i < historicalData.length; i++) {
      const recentCandles = historicalData.slice(0, i + 1);
      const decision = crossoverStrategy(recentCandles);
      const close = historicalData[i][4];

      if (decision === 'BUY' && balance > close) {
        asset += balance / close;
        balance = 0;
        trades++;
      } else if (decision === 'SELL' && asset > 0) {
        balance += asset * close;
        asset = 0;
        trades++;
      }
    }

    const finalPrice = historicalData[historicalData.length - 1][4];
    const finalValue = balance + (asset * finalPrice);

    // FIX: Create a single 'result' object with a distinct name.
    const result = {
      userId,
      timeframe,
      initialBalance: 10000,
      // BEST PRACTICE: Store numerical data as numbers, not strings.
      finalBalance: parseFloat(finalValue.toFixed(2)),
      totalTrades: trades,
      profit: parseFloat((finalValue - 10000).toFixed(2)),
      candlesTested: historicalData.length,
    };

    // FIX: Push the singular 'result' object into the 'allResults' array.
    allResults.push(result);

    if (userId) {
      // FIX: Use the 'result' object to create the database entry.
      await Backtest.create(result);
      await logToDb(userId, `[Backtest] ${timeframe} | Profit: $${result.profit} | Trades: ${result.totalTrades}`);
    }
  }

  console.log(`[Backtest] Completed all timeframes for user ${userId}.`);
  
  // FIX: Return the correct array containing all the results.
  return allResults;
};
