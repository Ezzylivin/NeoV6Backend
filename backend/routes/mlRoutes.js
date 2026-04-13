// File: backend/routes/mlRoutes.js
import express from 'express';
import { getModelsController } from '../controllers/mlController.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🚀 THE FIX: Renamed from '/models' to '/available-models' to match React frontend
router.get('/available-models', getModelsController); 

// 🟡 2. Legacy Route: Pre-calculated results
router.get('/ml-backtest-results', (req, res) => {
    const projectRoot = path.resolve(__dirname, '..');
    const filePath = path.join(projectRoot, 'data', 'backtest_results.json');
    console.log(`[Node Backend] Reading static results: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Pre-calculated results not found.' });
    } 
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read results.' });
        try {
            res.status(200).json(JSON.parse(data));
        } catch (parseError) {
            res.status(500).json({ error: 'JSON Parse Error' });
        }
    });
});

export default router;
