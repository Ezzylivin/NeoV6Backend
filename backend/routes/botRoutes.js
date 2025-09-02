import express from 'express';
import { isValidMarket } from '../utils/validateMarket.js';
import Bot from '../dbStructure/bot.js';

const router = express.Router();

router.post('/start', async (req, res) => {
  const { userId, symbol, strategy, initialBalance, timeframe, risk, exchange = 'coinbase' } = req.body;

  try {
    // Validate the symbol is allowed
    const valid = await isValidMarket(exchange, symbol);
    if (!valid) return res.status(400).json({ message: `Invalid symbol ${symbol} for exchange ${exchange}` });

    // Start bot logic (your existing code)
    const bot = await Bot.create({ userId, symbol, strategy, initialBalance, timeframe, risk, exchange, isRunning: true });

    res.json({ message: 'Bot started', bot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to start bot' });
  }
});

export default router;
