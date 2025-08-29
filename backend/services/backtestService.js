import Backtest from '../dbStructure/backtest.js';
import { logToDb } from './logService.js';
import ExchangeService from './exchangeService.js';

/**
 * Run backtest for a user.
 * Accepts all inputs: symbol, timeframe, initialBalance, strategy, risk
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

  const exchange = new ExchangeService();
  const historicalData = await exchange.fetchOHLCV(symbol, timeframe, 500);

  if (!historicalData || historicalData.length === 0) {
    throw new Error(`No historical data for ${symbol} on ${timeframe}`);
  }

  let balance = initialBalance;
  let asset = 0;
  let trades = 0;

  for (let i = 0; i < historicalData.length; i++) {
    const recentCandles = historicalData.slice(0, i + 1);
    const decision = crossoverStrategy(recentCandles); // define your strategy
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
  const finalBalance = balance + asset * finalPrice;

  const backtestData = {
    userId,
    symbol,
    timeframe,
    initialBalance,
    finalBalance: parseFloat(finalBalance.toFixed(2)),
    profit: parseFloat((finalBalance - initialBalance).toFixed(2)),
    totalTrades: trades,
    candlesTested: historicalData.length,
    strategy,
    risk,
    createdAt: new Date()
  };

  const saved = await Backtest.create(backtestData);
  await logToDb(userId, `[Backtest] ${symbol} | ${timeframe} | Profit: $${backtestData.profit} | Trades: ${trades}`);

  return saved;
}

/**
 * Fetch backtests with optional filters
 */
export async function getBacktests({ userId, symbol, timeframe }) {
  if (!userId) throw new Error('userId is required');
  
  let query = { userId };
  if (symbol) query.symbol = symbol;
  if (timeframe) query.timeframe = timeframe;

  return await Backtest.find(query).sort({ createdAt: -1 });
}
