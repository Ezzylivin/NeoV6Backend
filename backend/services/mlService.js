import axios from "axios";
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// --- Configuration (Copied from backtestService.js for consistency) ---
const ML_SERVER_URL = "http://74.208.28.77:8000,8001"; // URL for your Python server
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); // Allow self-signed cert

// --- Cache Configuration ---
// This file will store the model list to avoid calling Python on every page load
const MODEL_CACHE_DIR = path.resolve(process.cwd(), 'python_data');
const MODEL_CACHE_FILE = path.join(MODEL_CACHE_DIR, 'models_cache.json');
const CACHE_FRESHNESS_MINUTES = 60; // How long to use the cache before fetching new

/**
 * --- Get Available ML Models ---
 * This function fetches the list of all available models from the
 * Python compute server. It uses a cache to speed up repeated requests.
 */
export const getAvailableModels = async () => {
    console.log("[mlService] Request received for available models.");

    // --- 1. Caching Logic ---
    try {
        await fs.mkdir(MODEL_CACHE_DIR, { recursive: true });
        
        // Check if the cache file exists and is "fresh"
        const stats = await fs.stat(MODEL_CACHE_FILE);
        const now = new Date().getTime();
        const fileTime = new Date(stats.mtime).getTime();
        const ageInMinutes = (now - fileTime) / 1000 / 60;

        if (ageInMinutes < CACHE_FRESHNESS_MINUTES) {
            console.log(`[mlService] Cache HIT. Returning fresh models from ${MODEL_CACHE_FILE}.`);
            const cachedData = await fs.readFile(MODEL_CACHE_FILE, 'utf-8');
            return JSON.parse(cachedData);
        }
        
        console.log(`[mlService] Cache STALE (Age: ${ageInMinutes.toFixed(0)} mins). Fetching new models.`);

    } catch (error) {
        if (error.code !== 'ENOENT') {
             // This was an error reading the cache, not a miss
            console.error(`[mlService] Cache read error: ${error.message}. Forcing new run.`);
        }
        console.log("[mlService] Cache MISS. Calling Python server...");
    }
        
    // --- 2. CACHE MISS: Call Python Server ---
    // We assume the Python endpoint for models is '/api/ml/available-models'
    const flaskUrl = `${ML_SERVER_URL}/api/ml/available-models`;
    let models = [];
    
    try {
        console.log(`[mlService] Calling Python server at ${flaskUrl}`);
        const response = await axios.get(flaskUrl, { 
            httpsAgent: httpsAgent, 
            timeout: 10000 // 10 second timeout
        });

        if (!Array.isArray(response.data)) {
            throw new Error("Python server did not return an array of models.");
        }
        
        models = response.data;
        console.log(`[mlService] Successfully fetched ${models.length} models from Python.`);
    
    } catch (apiError) { // Handle API call errors
        let msg = `Python Server API call failed (${flaskUrl}): ${apiError.message}`;
        if (apiError.code === 'ECONNREFUSED' || apiError.code === 'ETIMEDOUT') msg += ` at ${ML_SERVER_URL}`;
        else if (apiError.response) msg += ` Status: ${apiError.response.status}. Data: ${JSON.stringify(apiError.response.data)}`;
        console.error(`[mlService] ${msg}`); 
        // We throw the error so the controller can catch it
        throw new Error(msg);
    }

    // --- 3. Save to Cache ---
    try { 
        await fs.writeFile(MODEL_CACHE_FILE, JSON.stringify(models, null, 2), 'utf-8'); 
        console.log(`[mlService] Saved new models to cache: ${MODEL_CACHE_FILE}`); 
    } catch (saveError) { 
        console.error(`[mlService] WARNING: Failed to save models to cache: ${saveError.message}`); 
    }

    // --- 4. Return new models ---
    return models;
};
