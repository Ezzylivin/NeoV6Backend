// File: backend/routes/userRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import User from '../models/user.js';

const router = express.Router();

// @route   GET /api/users
// @desc    Admin-only: Get all users (without passwords)
// @access  Private/Admin
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// @route   POST /api/users/keys
// @desc    Save or update exchange API keys
// @access  Private
router.post('/keys', protect, async (req, res) => {
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
