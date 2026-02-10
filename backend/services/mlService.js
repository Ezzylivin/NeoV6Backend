import axios from "axios";
import https from 'https';
import path from 'path';
import fs from 'fs/promises';

// --- Configuration ---
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- Cache Settings ---
const MODEL_CACHE_DIR = path.resolve(process.cwd(), 'python_data');
const MODEL_CACHE_FILE = path.join(MODEL_CACHE_DIR, 'models_cache.json');
const CACHE_FRESHNESS_MINUTES = 60; 

// 🟢 HARDCODED DEFAULTS (Safety Net)
// If Python is offline, we send these so the UI doesn't break.
const DEFAULT_MODELS = [
    { id: "xgboost", name: "XGBoost (Gradient Boosting)" },
    { id: "random_forest", name: "Random Forest (Bagging)" },
    { id: "gradient_boosting", name: "Gradient Boosting (Sklearn)" },
    { id: "lstm", name: "LSTM (Deep Recurrent)" },
    { id: "transformer", name: "Transformer (Attention)" },
    { id: "stacking", name: "Stacking Ensemble (Hybrid)" }
];

export const getAvailableModels = async () => {
    console.log("[mlService] Fetching available models...");

    // --- 1. Try Cache First ---
    try {
        await fs.mkdir(MODEL_CACHE_DIR, { recursive: true });
        
        // Check file existence and age
        // Use stat simply to check existence; catch block handles ENOENT
        const stats = await fs.stat(MODEL_CACHE_FILE);
        const now = new Date().getTime();
        const fileTime = new Date(stats.mtime).getTime();
        const ageInMinutes = (now - fileTime) / 1000 / 60;

        if (ageInMinutes < CACHE_FRESHNESS_MINUTES) {
            console.log(`[mlService] Cache HIT. Age: ${ageInMinutes.toFixed(0)}m`);
            const cachedData = await fs.readFile(MODEL_CACHE_FILE, 'utf-8');
            const parsed = JSON.parse(cachedData);
            // Only return cache if it actually has data
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
        console.log(`[mlService] Cache STALE or EMPTY. Fetching new from Python...`);
    } catch (e) {
        if (e.code !== 'ENOENT') console.error(`[mlService] Cache Error: ${e.message}`);
    }

    // --- 2. Call Python Server ---
    // Note: Standardized endpoint to /api/models based on typical Flask/FastAPI setups
    // If your Python uses /api/ml/available-models, keep it, but /api/models is common.
    const endpoint = `${ML_SERVER_URL}/api/models`; 
    let models = [];

    try {
        console.log(`[mlService] Calling: ${endpoint}`);
        const response = await axios.get(endpoint, { 
            httpsAgent, 
            timeout: 4000 // Short timeout so frontend doesn't hang
        });

        const data = response.data;
        models = Array.isArray(data) ? data : (data.models || []);

        if (!Array.isArray(models) || models.length === 0) {
            console.warn("[mlService] Python returned empty list/invalid format.");
            throw new Error("Empty response from Python"); // Trigger catch block to use defaults
        }

        console.log(`[mlService] Success. Found ${models.length} models.`);

        // --- 3. Update Cache (Only on success) ---
        try { 
            await fs.writeFile(MODEL_CACHE_FILE, JSON.stringify(models, null, 2), 'utf-8'); 
        } catch (saveError) { 
            console.error(`[mlService] Cache Save Failed: ${saveError.message}`); 
        }

        return models;

    } catch (apiError) {
        console.error(`[mlService] Python Connection Failed: ${apiError.message}`);
        console.warn("[mlService] 🟢 FALLBACK: Returning default models to UI.");
        
        // 🟢 FIX: Return defaults instead of empty array []
        return DEFAULT_MODELS; 
    }
};
