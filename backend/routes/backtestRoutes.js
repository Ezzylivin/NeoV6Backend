import express from 'express';
import { isValidMarket } from '../utils/validateMarket.js';
import Backtest from '../dbStructure/backtest.js';

const router = express.Router();

router.post('/run', async (req, res) => {
  const { userId, symbol, strategy, initialBalance, timeframe, risk, exchange = 'coinbase' } = req.body;

  try {
    // Validate symbol
    const valid = await isValidMarket(exchange, symbol);
    if (!valid) return res.status(400).json({ message: `Invalid symbol ${symbol} for exchange ${exchange}` });

    // Run backtest logic (your existing code)
    const backtest = await Backtest.create({ userId, symbol, strategy, initialBalance, timeframe, risk, exchange, results: {} });

    // Simulate some results for now
    backtest.results = { profit: Math.floor(Math.random() * 500) }; 
    await backtest.save();

    res.json({ message: 'Backtest run', backtest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to run backtest' });
  }
});

export default router;
