const express = require('express');
const Backtest = require('../models/backtestModel');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const backtests = await Backtest.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json(backtests);
  } catch {
    res.status(500).json({ message: 'Failed to fetch backtests' });
  }
});

module.exports = router;
