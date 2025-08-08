// File: backend/controllers/logController.js
import Log from '../dbStructure/log.js';

// @desc Get logs for user or admin
export const getLogs = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const logs = await log.find(
       {} : { userId: req.user.id }
    )
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(logs);
  } catch (err) {
    console.error('[GET LOGS ERROR]', err);
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
};

// @desc Create a new log entry
export const createLog = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const newLog = await log.create({
      userId: req.user.id,
      message,
    });

    res.status(201).json({ message: 'Log created', log: newLog });
  } catch (err) {
    console.error('[CREATE LOG ERROR]', err);
    res.status(500).json({ message: 'Failed to create log' });
  }
};
