// File: backend/controllers/backtestController.js
import Backtest from '../dbStructure/backtest.js';
import { logToDb } from '../services/logService.js';

// Run and save a new backtest
export const runAndSaveBacktests = async (req, res) => {
  try {
    const { userId, symbol, timeframe, initialBalance, strategy, risk } = req.body;

    if (!userId || !symbol || !timeframe || !initialBalance) {
      return res.status(400).json({ message: 'userId, symbol, timeframe, and initialBalance are required' });
    }

    // Simulate backtest logic or call real logic
    const profitPct = (Math.random() * 20 - 10).toFixed(2);
    const finalBalance = +(initialBalance * (1 + profitPct / 100)).toFixed(2);

    const result = {
      userId,
      symbol,
      timeframe,
      initialBalance,
      finalBalance,
      profit: +(finalBalance - initialBalance).toFixed(2),
      strategy: strategy || 'default',
      risk: risk || 'medium',
      totalTrades: Math.floor(Math.random() * 20) + 5,
      candlesTested: Math.floor(Math.random() * 500) + 100,
      createdAt: new Date(),
    };

    const savedBacktest = await Backtest.create(result);
    await logToDb(userId, `[Backtest] ${symbol} | ${timeframe} | $${initialBalance} | ${strategy} | ${risk} | Profit: $${result.profit}`);

    return res.status(201).json({ message: 'Backtest completed', backtests: [savedBacktest] });
  } catch (error) {
    console.error('[Backtest Error]', error);
    return res.status(500).json({ message: 'Failed to run backtests', error: error.message });
  }
};

// Get saved backtests by user with optional filters
export const getBacktestsByUser = async (req, res) => {
  try {
    const { userId, symbol, timeframe } = req.query;

    if (!userId) return res.status(400).json({ message: 'userId is required' });

    let query = { userId };
    if (symbol) query.symbol = symbol;
    if (timeframe) query.timeframe = timeframe;

    const backtests = await Backtest.find(query).sort({ createdAt: -1 });
    res.status(200).json(backtests);
  } catch (error) {
    console.error('[Get Backtests Error]', error);
    res.status(500).json({ message: 'Failed to retrieve backtests', error: error.message });
  }
};
