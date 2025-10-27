// File: backend/routes/mlRoutes.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Needed for __dirname in ES Modules

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
