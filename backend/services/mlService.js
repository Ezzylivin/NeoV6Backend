import axios from "axios";
import https from 'https';
import path from 'path';
import fs from 'fs/promises';

// --- Configuration ---
// 🟢 Use Environment Variable or Fallback to your VPS
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- Cache Settings ---
const MODEL_CACHE_DIR = path.resolve(process.cwd(), 'python_data');
const MODEL_CACHE_FILE = path.join(MODEL_CACHE_DIR, 'models_cache.json');
const CACHE_FRESHNESS_MINUTES = 60; 

export const getAvailableModels = async () => {
    console.log("[mlService] Fetching available models...");

    // --- 1. Try Cache First ---
    try {
        await fs.mkdir(MODEL_CACHE_DIR, { recursive: true });
        
        // Check file existence and age
        const stats = await fs.stat(MODEL_CACHE_FILE);
        const now = new Date().getTime();
        const fileTime = new Date(stats.mtime).getTime();
        const ageInMinutes = (now - fileTime) / 1000 / 60;

        if (ageInMinutes < CACHE_FRESHNESS_MINUTES) {
            console.log(`[mlService] Cache HIT. Age: ${ageInMinutes.toFixed(0)}m`);
            const cachedData = await fs.readFile(MODEL_CACHE_FILE, 'utf-8');
            return JSON.parse(cachedData);
        }
        console.log(`[mlService] Cache STALE. Fetching new from Python...`);
    } catch (e) {
        // Ignore file not found errors
        if (e.code !== 'ENOENT') console.error(`[mlService] Cache Error: ${e.message}`);
    }

    // --- 2. Call Python Server ---
    const endpoint = `${ML_SERVER_URL}/api/ml/available-models`;
    let models = [];

    try {
        console.log(`[mlService] Calling: ${endpoint}`);
        const response = await axios.get(endpoint, { 
            httpsAgent, 
            timeout: 5000 // 5s timeout is enough for a list
        });

        // Handle if Python returns { models: [...] } or just [...]
        const data = response.data;
        models = Array.isArray(data) ? data : (data.models || []);

        if (!Array.isArray(models)) {
            console.warn("[mlService] Warning: Python returned unexpected format:", data);
            models = []; 
        }

        console.log(`[mlService] Success. Found ${models.length} models.`);

    } catch (apiError) {
        console.error(`[mlService] Python Connection Failed: ${apiError.message}`);
        // Return empty array instead of crashing controller
        // This allows the page to load even if ML is offline
        return []; 
    }

    // --- 3. Update Cache ---
    try { 
        await fs.writeFile(MODEL_CACHE_FILE, JSON.stringify(models, null, 2), 'utf-8'); 
    } catch (saveError) { 
        console.error(`[mlService] Cache Save Failed: ${saveError.message}`); 
    }

    return models;
};
