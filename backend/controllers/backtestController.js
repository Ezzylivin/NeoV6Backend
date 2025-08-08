import ExchangeService from '../exchangeService.js';
import Backtest from '../dbStructure/backtest.js';
import { logToDb } from '../logService.js';

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

/**
 * Controller to run backtests across multiple timeframes for a user,
 * save results to MongoDB, and return them in the response.
 */
export const runAndSaveBacktests = async (req, res) => {
  try {
    const { userId } = req.body;  // user ID sent from client/request

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const exchange = new ExchangeService();
    const allResults = [];

    for (const timeframe of TIMEFRAMES) {
      // Fetch historical OHLCV data from exchange API
      const historicalData = await exchange.fetchOHLCV('BTC/USDT', timeframe, 500);

      if (!historicalData || historicalData.length === 0) {
        console.log(`[Backtest] No data for timeframe ${timeframe}, skipping`);
        continue;
      }

      let balance = 10000;
      let asset = 0;
      let trades = 0;

      // Run simple crossoverStrategy on historical data
      for (let i = 0; i < historicalData.length; i++) {
        const recentCandles = historicalData.slice(0, i + 1);
        const decision = crossoverStrategy(recentCandles);  // You define this strategy function
        const close = historicalData[i][4];  // Closing price

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

      // Build the backtest result object
      const result = {
        userId,
        timeframe,
        initialBalance: 10000,
        finalBalance: parseFloat(finalValue.toFixed(2)),
        totalTrades: trades,
        profit: parseFloat((finalValue - 10000).toFixed(2)),
        candlesTested: historicalData.length,
      };

      // Save to DB
      const savedBacktest = await Backtest.create(result);

      // Log info for audit/debugging
      await logToDb(userId, `[Backtest] ${timeframe} | Profit: $${result.profit} | Trades: ${result.totalTrades}`);

      // Add saved record to array for response
      allResults.push(savedBacktest);
    }

    console.log(`[Backtest] Completed all timeframes for user ${userId}`);

    // Respond with all saved backtest documents
    return res.status(201).json({ message: 'Backtests completed', backtests: allResults });
  } catch (error) {
    console.error('[Backtest Error]', error);
    return res.status(500).json({ message: 'Failed to run backtests' });
  }
};

/**
 * Controller to fetch all backtests for a specific user.
 * Optional: Add filters or pagination as needed.
 */
export const getBacktestsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find all backtests for the user, sorted newest first
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json(backtests);
  } catch (error) {
    console.error('[Get Backtests Error]', error);
    res.status(500).json({ message: 'Failed to retrieve backtests' });
  }
};
