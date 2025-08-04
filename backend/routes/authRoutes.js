import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import User from '../models/userModel.js';

const router = express.Router();

router.post('/keys', protect, async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  const user = await User.findById(req.user._id);
  user.apiKey = apiKey;
  user.apiSecret = apiSecret;
  await user.save();
  res.json({ message: 'Keys saved' });
});

export default router;
