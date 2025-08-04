const express = require('express');
const User = require('../models/userModel');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ message: 'Error fetching user info' });
  }
});

router.post('/keys', authMiddleware, async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.apiKey = apiKey;
    user.apiSecret = apiSecret;
    await user.save();
    res.json({ message: 'API keys saved' });
  } catch {
    res.status(500).json({ message: 'Failed to save API keys' });
  }
});

module.exports = router;
