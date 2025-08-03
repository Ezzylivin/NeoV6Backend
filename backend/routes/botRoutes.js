// backend/routes/botRoutes.js
// backend/routes/botRoutes.js
const express = require('express');
const botService = require('../services/botService');
const router = express.Router();

router.post('/start', (req, res) => {
  const { symbol, amount, timeframes } = req.body;
  if (!symbol || !amount) {
    return res.status(400).json({ message: 'symbol and amount are required.' });
  }
  const tfArray = Array.isArray(timeframes) && timeframes.length > 0 ? timeframes : ['5m'];

  botService.startTradingBot(req.user.id, symbol, amount, tfArray);
  res.json({ status: `Bot started for ${symbol} amount ${amount} on ${tfArray.join(', ')}` });
});

router.post('/stop', (req, res) => {
  botService.stopTradingBot(req.user.id);
  res.json({ status: 'Bot stop command received.' });
});

module.exports = router;
