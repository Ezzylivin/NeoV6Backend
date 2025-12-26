// File: backend/routes/mlRoutes.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 🟢 IMPORT THE CONTROLLER
import { getAvailableModels } from '../controllers/mlController.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Route to GET Available ML Models ---
// 🟢 USE THE CONTROLLER HERE
router.get('/available-models', getAvailableModels);


// --- Route to serve PRE-CALCULATED ML Backtest Results ---
// (Keep this existing logic as is, or move it to a controller later)
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
