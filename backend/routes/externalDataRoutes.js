import express from 'express';
import axios from 'axios';
const router = express.Router();

router.get('/crypto-macro-data', async (req, res) => {
  try {
    // This URL comes from an environment variable, pointing to your deployed Python service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL;

    if (!pythonServiceUrl) {
      throw new Error("Python service URL is not configured.");
    }

    console.log(`Fetching data from Python service at ${pythonServiceUrl}/api/data`);
    const response = await axios.get(`${pythonServiceUrl}/api/data`);

    res.json(response.data);

  } catch (error) {
    console.error('Error fetching data from Python service:', error.message);
    res.status(500).json({ message: 'Failed to fetch external trading data' });
  }
});

export default router;
