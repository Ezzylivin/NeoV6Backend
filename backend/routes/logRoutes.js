// File: backend/routes/logRoutes.js
import express from 'express';
import Log from '../models/logModel.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   GET /api/logs
 * @desc    Admin sees all logs; users see only their own (latest 100)
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    const Logs = await Log.find(
      isAdmin ? {} : { userId: req.user._id }
    ).sort({ createdAt: -1 }).limit(100);

    res.json(Logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
});

/**
 * @route   POST /api/logs
 * @desc    Add a log message
 * @access  Private
 * @body    { message: "..." }
 */
router.post('/', protect, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const Log = await Log.create({
      userId: req.user._id,
      message,
    });

    res.status(201).json({ message: 'Log created', log });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create log' });
  }
});

export default router;
