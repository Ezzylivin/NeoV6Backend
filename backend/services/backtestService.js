// File: backend/services/backtestService.js
import Backtest from '../dbStructure/backtest.js';
import { logToDb } from './logService.js';
import ExchangeService from './exchangeService.js';
import Price from "../dbStructure/price.js";

/**
 * Run backtest for a user.
 * Accepts symbol, timeframe, initialBalance, strategy, risk
 */
export async function runAndSaveBacktest({
  userId,
  symbol,
  timeframe,
  initialBalance,
  strategy = 'default',
  risk = 'medium'
}) {
  if (!userId || !symbol || !timeframe || !initialBalance) {
    throw new Error('userId, symbol, timeframe, and initialBalance are required.');
  }

  // Fetch historical data: prefer DB first, fallback to ExchangeService
  let historicalData = await Price.find({ symbol, timeframe }).sort({ timestamp: 1 });

  if (!historicalData.length) {
    const exchange = new ExchangeService();
    const rawData = await exchange.fetchOHLCV(symbol, timeframe, 500);
    if (!rawData || !rawData.length) {
      throw new Error(`No historical data for ${symbol} on ${timeframe}`);
    }

    historicalData = rawData.map(candle => ({
      price: candle[4],          // closing price
      timestamp: candle[0]
    }));
  }

  let balance = initialBalance;
  let asset = 0;
  let trades = 0;

  // Simple strategy example: moving average crossover (replace with real one)
  for (let i = 1; i < historicalData.length; i++) {
    const prev = historicalData[i - 1].price;
    const current = historicalData[i].price;

    const decision = current > prev ? 'BUY' : 'SELL'; // simple crossover logic

    if (decision === 'BUY' && balance > current) {
      asset += balance / current;
      balance = 0;
      trades++;
    } else if (decision === 'SELL' && asset > 0) {
      balance += asset * current;
      asset = 0;
      trades++;
    }
  }

  const finalPrice = historicalData[historicalData.length - 1].price;
