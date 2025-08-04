// File: backend/routes/logRoutes.js
import express from 'express';
import Log from '../models/logModel.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();


// Only admin can fetch logs
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const logs = await Log.find().sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
});

// GET /api/logs - latest 100 logs
router.get('/', protect, async (req, res) => {
  try {
    const logs = await Log.find({ userId: req.user._id })
      .sort({ timestamp: -1 }) // or createdAt if your schema uses that
      .limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;
