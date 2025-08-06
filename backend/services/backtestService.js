// File: backend/services/backtestService.js
import ExchangeService from './exchangeService.js';
import { crossoverStrategy } from './strategyEngine.js';
import Backtest from '../dbStructure/backtest.js';
import { logToDb } from './loggerService.js';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

/**
 * Run backtests across all timeframes for given user
 */
export const runBacktestAndStore = async (userId) => {
  console.log(`[Backtest] Starting across ${TIMEFRAMES.length} timeframes...`);
  const exchange = new ExchangeService();
  const results = [];

  for (const timeframe of TIMEFRAMES) {
    const historicalData = await exchange.fetchOHLCV('BTC/USDT', timeframe, 500);

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

    const results = {
      userId,
      timeframe,
      initialBalance: 10000,
      finalBalance: finalValue.toFixed(2),
      totalTrades: trades,
      profit: (finalValue - 10000).toFixed(2),
      candlesTested: historicalData.length,
    };

    results.push(results);

    // Store result in DB if userId is provided
    if (userId) {
      await Backtest.create(results);
      await logToDb(userId, `[Backtest] ${timeframe} | Profit: $${results.profit} | Trades: ${results.totalTrades}`);
    }
  }

  console.log(`[Backtest] Completed all timeframes.`);
  return results;
};
