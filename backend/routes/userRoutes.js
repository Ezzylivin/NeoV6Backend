// File: backend/routes/userRoutes.js
const express = require('express');
const User = require('../models/userModel');
const { encrypt } = require('../services/cryptoService');
const router = express.Router();

// @desc    Save/update user's exchange API keys
// @route   POST /api/user/keys
router.post('/keys', async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ message: 'API Key and Secret are required.' });
  }

  const user = await User.findById(req.user._id);
  if (user) {
    user.exchangeApiKey = encrypt(apiKey);
    user.exchangeApiSecret = encrypt(apiSecret);
    await user.save();
    res.json({ message: 'API keys saved securely.' });
  } else {
    res.status(404).json({ message: 'User not found.' });
  }
});

module.exports = router;
