const express = require('express');
const Log = require('../models/logModel');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const logs = await Log.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch {
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
});

module.exports = router;
