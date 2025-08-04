const express = require('express');
const Log = require('../models/logModel');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/logs - get latest 100 logs for authenticated user
router.get('/', protect, async (req, res) => {
  try {
    const logs = await Log.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;
