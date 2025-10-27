// File: backend/routes/mlRoutes.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Needed for __dirname in ES Modules

// --- Configuration ---
// Make sure this URL is correct (HTTP, Port 8001)
const ML_SERVER_URL = "http://74.208.28.77:8001"; 

// --- Route to GET Available ML Models --- 
// --- ADD THIS ENTIRE BLOCK ---
router.get('/available-models', async (req, res) => {
    const ml_models_url = `${ML_SERVER_URL}/api/ml/models`;
    console.log(`[Node Backend] Fetching available models from: ${ml_models_url}`);
    try {
        // No httpsAgent needed for HTTP
        const response = await axios.get(ml_models_url); 
        console.log("[Node Backend] Successfully fetched models:", response.data);
        res.status(200).json(response.data || []); // Send the list back to the controller
    } catch (error) {
        let errorMessage = `Failed to fetch available models from ML server.`;
         // Add connection refused check
         if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server running at ${ML_SERVER_URL}?`;}
        else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.error || error.response.statusText}`; } 
        else if (error.request) { errorMessage += ` No response from ML server.`; } 
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[Node Backend] Error fetching models: ${errorMessage}`);
        res.status(500).json({ error: errorMessage });
    }
});
// --- END OF NEW BLOCK ---

const router = express.Router();

// Helper to get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Route to serve ML Backtest Results ---
router.get('/ml-backtest-results', (req, res) => {
  // Construct the full path relative to the *project root*
  // Assumes your /data folder is at the same level as your /routes folder
  const projectRoot = path.resolve(__dirname, '..'); // Go up one level from /routes
  const filePath = path.join(projectRoot, 'data', 'backtest_results.json');

  console.log(`Attempting to read: ${filePath}`); // Add logging

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    console.error(`Error: ${filePath} not found.`);
    return res.status(404).json({ error: 'Backtest results file not found.' });
  }

  // Read the file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading backtest results file:', err);
      return res.status(500).json({ error: 'Failed to read backtest results.' });
    }

    try {
      // Parse the JSON data
      const jsonData = JSON.parse(data);
      // Send the parsed JSON object as the response
      res.status(200).json(jsonData);
    } catch (parseError) {
      console.error('Error parsing backtest results JSON:', parseError);
      return res.status(500).json({ error: 'Failed to parse backtest results JSON.' });
    }
  });
});

export default router;
