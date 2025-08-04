// File: backend/routes/logRoutes.js
import express from 'express';
import Log from '../models/logModel.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   GET /api/logs
 * @desc    Admin gets all logs, users get only their own (latest 100)
 * @access  Private (all roles)
 */
router.get('/', protect, async (req, res) => {
  try {
    let logs;

    if (req.user.role === 'admin') {
      // Admin sees all logs
      logs = await Log.find().sort({ createdAt: -1 }).limit(100);
    } else {
      // Other users see only their own logs
      logs = await Log.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
    }

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
});

export default router;
