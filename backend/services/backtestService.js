import ExchangeService from './exchangeService.js';
import { crossoverStrategy } from './strategyEngine.js';
import Backtest from '../dbStructure/backtest.js';
import { logToDb } from './loggerService.js';

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
  const allResults = []; // Use a distinct name for the main array

  for (const timeframe of TIMEFRAMES) {
    const historicalData = await exchange.fetchOHLCV('BTC/USDT', timeframe, 500);
    
    // If no data is returned, skip this timeframe
    if (!historicalData || historicalData.length === 0) {
      console.log(`[Backtest] No historical data found for ${timeframe}. Skipping.`);
      continue;
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

    // *** FIX 1: Renamed this object to `result` (singular) ***
    const result = {
      userId,
      timeframe,
      initialBalance: 10000,
      finalBalance: parseFloat(finalValue.toFixed(2)),
      totalTrades: trades,
      profit: parseFloat((finalValue - 10000).toFixed(2)),
      candlesTested: historicalData.length,
    };

    // *** FIX 2: Pushed the singular `result` object into the `allResults` array ***
    allResults.push(result);

    // Store result in DB if userId is provided
    if (userId) {
      // *** FIX 3: Create the backtest using the singular `result` object ***
      await Backtest.create(result);
      await logToDb(userId, `[Backtest] ${timeframe} | Profit: $${result.profit} | Trades: ${result.totalTrades}`);
    }
  }

  console.log(`[Backtest] Completed all timeframes for user ${userId}.`);
  // *** FIX 4: Return the array that contains all the results ***
  return allResults;
};
