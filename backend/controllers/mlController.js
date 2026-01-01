// File: src/backend/controllers/mlController.js

import axios from 'axios';
import https from 'https';

// --- Configuration ---
// Use the exact same logic as your working service
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export const getAvailableModels = async (req, res) => {
  // 1. Define the Correct URL (Matches your Python Swagger Docs)
  const targetUrl = `${ML_SERVER_URL}/api/ml/available-models`;

  try {
    console.log(`[mlController] Proxying request to: ${targetUrl}`);
    
    // 2. Call Python Server
    const response = await axios.get(targetUrl, {
      httpsAgent,
      timeout: 5000 // 5s timeout
    });

    // 3. Return Data to Frontend
    res.json(response.data);

  } catch (error) {
    console.error(`[mlController] Error fetching models: ${error.message}`);
    
    if (error.response) {
      // Python server replied with an error (e.g., 404 or 500)
      console.error(`[mlController] Python Status: ${error.response.status}`);
      res.status(error.response.status).json({ 
        error: `ML Server Error: ${error.response.status}`,
        details: error.response.data 
      });
    } else if (error.request) {
      // Python server is down or unreachable
      res.status(503).json({ error: "ML Server is unreachable (Connection Refused)" });
    } else {
      // Other errors
      res.status(500).json({ error: "Internal Backend Error" });
    }
  }
};
