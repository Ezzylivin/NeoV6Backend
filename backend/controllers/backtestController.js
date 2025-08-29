import ExchangeService from '../services/exchangeService.js';
import Backtest from '../dbStructure/backtest.js';
import { logToDb } from '../services/logService.js';

export const runAndSaveBacktests = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];
    const exchange = new ExchangeService();
    const allResults = [];

    for (const timeframe of TIMEFRAMES) {
      const historicalData = await exchange.fetchOHLCV('BTC/USDT', timeframe, 500);
      if (!historicalData || historicalData.length === 0) continue;

      let balance = 10000, asset = 0, trades = 0;

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
      const finalValue = balance + asset * finalPrice;

      const result = {
        userId,
        timeframe,
        initialBalance: 10000,
        finalBalance: parseFloat(finalValue.toFixed(2)),
        totalTrades: trades,
        profit: parseFloat((finalValue - 10000).toFixed(2)),
        candlesTested: historicalData.length,
      };

      const savedBacktest = await Backtest.create(result);
      await logToDb(userId, `[Backtest] ${timeframe} | Profit: $${result.profit} | Trades: ${result.totalTrades}`);
      allResults.push(savedBacktest);
    }

    res.status(201).json({ message: 'Backtests completed', backtests: allResults });
  } catch (error) {
    console.error('[Backtest Error]', error);
    res.status(500).json({ message: 'Failed to run backtests' });
  }
};

// New: fetch backtests with optional userId & timeframe filtering
export const getBacktestsByUser = async (req, res) => {
  try {
    const { userId, timeframe } = req.query;

    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const query = { userId };
    if (timeframe) query.timeframe = timeframe;

    const backtests = await Backtest.find(query).sort({ createdAt: -1 });
    res.status(200).json(backtests);
  } catch (error) {
    console.error('[Get Backtests Error]', error);
    res.status(500).json({ message: 'Failed to retrieve backtests' });
  }
};
