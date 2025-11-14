// File: backend/routes/mlRoutes.js
// UPDATED: Now uses HTTPS and port 8001 for ML_SERVER_URL and includes httpsAgent.

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import https from 'https'; // <-- 1. ADD HTTPS IMPORT

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
// ✅ UPDATED: Use HTTPS and port 8001
const ML_SERVER_URL = "https://74.208.28.77:8000";

// ✅ ADDED: Agent to handle self-signed certificates for HTTPS calls
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- Route to GET Available ML Models ---
router.get('/available-models', async (req, res) => {
    const ml_models_url = `${ML_SERVER_URL}/api/ml/available-models`;
    console.log(`[Node Backend] Fetching available models from: ${ml_models_url}`);
    try {
        // ✅ ADDED httpsAgent to the axios call
        const response = await axios.get(ml_models_url, { httpsAgent: httpsAgent });
        console.log("[Node Backend] Successfully fetched models:", response.data);
        res.status(200).json(response.data || []); // Send the list back
    } catch (error) {
        let errorMessage = `Failed to fetch available models from ML server.`;
         // Add connection refused check
         if (error.code === 'ECONNREFUSED') { errorMessage += ` Connection refused. Is the ML server API running at ${ML_SERVER_URL} and accessible?`;}
         // Handle SSL errors specifically if needed
         else if (error.message.includes('SSL') || error.message.includes('certificate')) { errorMessage += ` SSL Certificate issue. Ensure the ML server is running with valid certificates or try allowing self-signed certificates. Error: ${error.message}`;}
        else if (error.response) { errorMessage += ` Status: ${error.response.status}. ${error.response.data?.error || error.response.statusText}`; }
        else if (error.request) { errorMessage += ` No response from ML server API.`; }
        else { errorMessage += ` Error: ${error.message}`; }
        console.error(`[Node Backend] Error fetching models: ${errorMessage}`);
        res.status(500).json({ error: errorMessage });
    }
});

// --- Route to serve PRE-CALCULATED ML Backtest Results ---
// --- (This route remains unchanged as it reads a local file) ---
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
