// File: src/backend/controllers/mlController.js
import axios from 'axios';
import https from 'https';

const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export const getAvailableModels = async (req, res) => {
  const targetUrl = `${ML_SERVER_URL}/api/ml/available-models`;

  try {
    console.log(`[mlController] Proxying request to: ${targetUrl}`);
    
    const response = await axios.get(targetUrl, {
      httpsAgent,
      timeout: 5000 
    });

    res.json(response.data);

  } catch (error) {
    console.error(`[mlController] Error fetching models: ${error.message}`);
    
    if (error.response) {
      res.status(error.response.status).json({ 
        error: `ML Server Error: ${error.response.status}`,
        details: error.response.data 
      });
    } else if (error.request) {
      res.status(503).json({ error: "ML Server is unreachable" });
    } else {
      res.status(500).json({ error: "Internal Backend Error" });
    }
  }
};
