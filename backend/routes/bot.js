const express = require('express');
const router = express.Router();
const { startTradingBot, stopTradingBot } = require('../services/botService');

router.post('/start', async (req, res) => {
  const { userId, symbol, amount, timeframes } = req.body;
  try {
    await startTradingBot(userId, symbol, amount, timeframes);
    res.status(200).json({ message: 'Bot started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stop', (req, res) => {
  const { userId } = req.body;
  try {
    stopTradingBot(userId);
    res.status(200).json({ message: 'Bot stopped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
