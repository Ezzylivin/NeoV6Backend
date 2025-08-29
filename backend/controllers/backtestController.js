import { runAndSaveBacktest, getBacktests } from '../services/backtestService.js';

export const runBacktestController = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk } = req.body;

    const result = await runAndSaveBacktest({
      userId,
      symbol,
      timeframe,
      initialBalance,
      strategy,
      risk
    });

    res.status(201).json({ message: 'Backtest completed', backtest: result });
  } catch (err) {
    console.error('[Backtest Error]', err);
    res.status(500).json({ message: err.message });
  }
};

export const getBacktestsController = async (req, res) => {
  try {
    const { userId, symbol, timeframe } = req.query;

    const results = await getBacktests({ userId, symbol, timeframe });
    res.status(200).json(results);
  } catch (err) {
    console.error('[Get Backtests Error]', err);
    res.status(500).json({ message: err.message });
  }
};
