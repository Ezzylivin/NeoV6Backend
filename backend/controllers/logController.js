// File: backend/controllers/logController.js
import Log from '../dbStructure/log.js';

/**
 * Fetches logs for the authenticated user.
 * GET /api/logs
 */
export const getLogs = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 100;
    
    // CORRECT: Uses the capitalized 'Log' model name
    const logs = await Log.find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(); // Use .lean() for faster read-only queries

    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    console.error('[GET LOGS ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
};

/**
 * Creates a new log entry for the authenticated user.
 * POST /api/logs
 */
export const createLog = async (req, res) => {
  try {
    const userId = req.user._id;
    const { message, level } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Log message is required' });
    }

    const newLog = await Log.create({
      userId,
      message,
      level: level || 'info', // Default to 'info' if no level is provided
    });

    res.status(201).json({ success: true, message: 'Log created successfully', data: newLog });
  } catch (err) {
    console.error('[CREATE LOG ERROR]', err);
    res.status(500).json({ success: false, message: 'Failed to create log' });
  }
};
