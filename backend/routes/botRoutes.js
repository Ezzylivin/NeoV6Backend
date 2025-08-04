const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const BotStatus = require('../models/botStatusModel');
const router = express.Router();

router.post('/start', authMiddleware, async (req, res) => {
  const { symbol, amount, timeframes } = req.body;
  try {
    let botStatus = await BotStatus.findOne({ userId: req.user._id });
    if (!botStatus) botStatus = new BotStatus({ userId: req.user._id });

    botStatus.isRunning = true;
    botStatus.symbol = symbol;
    botStatus.amount = amount;
    botStatus.timeframes = timeframes;
    botStatus.startedAt = new Date();
    await botStatus.save();

    // TODO: Start your bot service logic here
    res.json({ message: 'Bot started', status: botStatus });
  } catch {
    res.status(500).json({ message: 'Failed to start bot' });
  }
});

router.post('/stop', authMiddleware, async (req, res) => {
  try {
    const botStatus = await BotStatus.findOne({ userId: req.user._id });
    if (!botStatus || !botStatus.isRunning) return res.status(400).json({ message: 'Bot not running' });

    botStatus.isRunning = false;
    await botStatus.save();

    // TODO: Stop your bot service logic here
    res.json({ message: 'Bot stopped' });
  } catch {
    res.status(500).json({ message: 'Failed to stop bot' });
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const botStatus = await BotStatus.findOne({ userId: req.user._id });
    if (!botStatus) return res.status(404).json({ message: 'No bot status found' });
    res.json(botStatus);
  } catch {
    res.status(500).json({ message: 'Failed to get bot status' });
  }
});

module.exports = router;
