// File: backend/controllers/logController.js
import Log from '../dbStructure/log.js'; // Note the uppercase 'L'

export const getLogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 100;
    
    // CORRECT: Uses the capitalized 'Log' model name
    const logs = await Log.find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(logs);
  } catch (err) {
    console.error('[GET LOGS ERROR]', err);
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
};
