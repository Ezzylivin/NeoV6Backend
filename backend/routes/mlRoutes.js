// File: backend/routes/mlRoutes.js
// This file is now correct because our Python server is also running HTTPS.

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import https from 'https'; // <-- This is now required

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
// ✅ Use HTTPS and port 8000
const ML_SERVER_URL = "https://74.208.28.77:8000";

// ✅ Agent to handle self-signed or Let's Encrypt certificates
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- Route to GET Available ML Models ---
router.get('/available-models', async (req, res) => {
    const ml_models_url = `${ML_SERVER_URL}/api/ml/models`;
    console.log(`[Node Backend] Fetching available models from: ${ml_models_url}`);
    try {
        // ✅ Use the httpsAgent
        const response = await axios.get(ml_models_url, { httpsAgent: httpsAgent });
        console.log("[Node Backend] Successfully fetched models:", response.data);
        res.status(200).json(response.data || []); // Send the list back
    } catch (error) {
        let errorMessage = `Failed to fetch available models from ML server.`;
         
         if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server API running at ${ML_SERVER_URL} and accessible?`;}
         else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.detail || error.response.statusText}`; }
         else if (error.request) { errorMessage += ` No response from ML server API.`; }
         else { errorMessage += ` Error: ${error.message}`; }
         
        console.error(`[Node Backend] Error fetching models: ${errorMessage}`);
        res.status(500).json({ error: errorMessage });
    }
});

// --- Route to serve PRE-CALCULATED ML Backtest Results ---
router.get('/ml-backtest-results', (req, res) => {
    const projectRoot = path.resolve(__dirname, '..');
    const filePath = path.join(projectRoot, 'data', 'backtest_results.json');
    console.log(`[Node Backend] Attempting to read PRE-CALCULATED results: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        console.error(`Error: ${filePath} not found.`);
        return res.status(404).json({ error: 'Pre-calculated backtest results file not found.' });
   } 
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading pre-calculated results file:', err);
            return res.status(500).json({ error: 'Failed to read pre-calculated results.' });
        }
        try {
            const jsonData = JSON.parse(data);
            res.status(200).json(jsonData);
        } catch (parseError) {
            console.error('Error parsing pre-calculated results JSON:', parseError);
            return res.status(500).json({ error: 'Failed to parse pre-calculated results JSON.' });
        }
    });
}); 

export default router;
