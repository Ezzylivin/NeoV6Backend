// File: backend/services/backtestService.js
import ExchangeService from './exchangeService.js';
import { crossoverStrategy } from './strategyEngine.js';
import Backtest from '../models/backtestModel.js';
import { logToDb } from './loggerService.js';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

/**
 * Run backtests across multiple timeframes using crossover strategy.
 * Stores results in MongoDB per timeframe if userId is provided.
 */
export const runBacktestAndStore = async (userId = timeframe = '1h') => {
  console.log(`[Backtest] Starting across ${TIMEFRAMES.length} timeframes...`);

  const exchange = new ExchangeService();
  const results = [];

  for (const timeframe of TIMEFRAMES) {
    const historicalData = await exchange.fetchOHLCV('BTC/USDT', timeframe, 500);

    let balance = 10000;
    let asset = 0;
    let trades = 0;

    for (const candle of historicalData) {
      const index = historicalData.indexOf(candle);
      const recentCandles = historicalData.slice(0, index + 1);
      const decision = crossoverStrategy(recentCandles);

      const close = candle[4];

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

    const result = {
      userId,
      timeframe,
      initialBalance: 10000,
      finalBalance: finalValue.toFixed(2),
      totalTrades: trades,
      profit: (finalValue - 10000).toFixed(2),
      candlesTested: historicalData.length,
    };

    results.push(result);

    if (userId) {
      await Backtest.create(result);
      await logToDb(userId, `[Backtest:${timeframe}] Profit: ${result.profit} USDT`);
    }

    console.log(`[Backtest:${timeframe}] Done — Final Balance: ${result.finalBalance} USDT`);
  }

  return results;
};
