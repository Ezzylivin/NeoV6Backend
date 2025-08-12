// File: backend/routes/authorizationRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import User from '../dbStructure/user.js';

const router = express.Router();



// @route   POST /api/users/keys
// @desc    Save or update exchange API keys
// @access  Private
router.post('/keys', verifyToken, async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.apiKey = apiKey;
    user.apiSecret = apiSecret;
    await user.save();

    res.json({ message: 'Keys saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
