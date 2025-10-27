import express from 'express';
import axios from 'axios';
const router = express.Router();

// This is the ONLY route that should be in this file.
router.get('/crypto-macro-data', async (req, res) => {
  try {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL;
    if (!pythonServiceUrl) {
      throw new Error("Python service URL is not configured.");
    }
    const response = await axios.get(`${pythonServiceUrl}/api/data`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching data from Python service:', error.message);
    res.status(500).json({ message: 'Failed to fetch external trading data' });
  }
});

// The backtest route has been removed from here.

export default router;
