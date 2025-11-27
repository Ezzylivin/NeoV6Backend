// File: src/backend/services/botService.js
// 🚀 UPGRADE: Supports "Golden Strategies" by allowing raw codes (no DB requirement).

import axios from 'axios';
import https from 'https';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

// --- Configuration ---
// Ensure this points to your Python Server
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- API Helper ---
async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        const url = `${ML_SERVER_URL}${endpoint}`;
        
        const config = { 
            method, 
            url, 
            data,
            httpsAgent: httpsAgent,
            timeout: 15000 // Increased timeout for ML ops
        };

        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`[Python API Error] ${endpoint}:`, error.message);
        const status = error.response ? error.response.status : 500;
        const msg = error.response?.data?.detail || error.message;
        const customError = new Error(`ML Server Error: ${msg}`);
        customError.status = status;
        throw customError;
    }
}

/**
 * Fetches the list of all winning strategies.
 */
export async function getWinnersList() {
    try {
        const list = await callPythonApi('/api/bot/winners', 'GET');
        return list || [];
    } catch (e) {
        console.error("Failed to fetch winners list:", e.message);
        return [];
    }
}

/**
 * Starts the Live Paper Trading Bot on the Python Server.
 */
export async function startTradingBot(userId, config = {}) {
    if (!userId) throw new Error("Missing userId");
    const { strategyId, symbol, timeframe, capitalAllocation, comboConfig, mlMode, mlModel, mlThreshold, params } = config;

    // 1. Prepare Payloads
    let strategiesPayload = [];
    let paramsPayload = {
        hybridMode: 'AND', // Default
        ...params // Merge optimized params (e.g. atr_period, rsi_length)
    };

    // --- CASE A: Combo Config (Saved or Golden) ---
    if (comboConfig && comboConfig.strategyCodes?.length > 0) {
        
        // Step 1: Try to find strategies in the DB (User Saved Setups)
        const dbStrategies = await Strategy.find({ 
            userId: userId, 
            code: { $in: comboConfig.strategyCodes } 
        }).lean();

        if (dbStrategies.length > 0) {
            // ✅ FOUND IN DB: Use the user's saved definitions
            console.log(`[BotService] Found ${dbStrategies.length} strategies in DB.`);
            strategiesPayload = dbStrategies.map(s => ({
                code: s.code,
                params: s.params
            }));
        } else {
            // 🚀 FALLBACK: GOLDEN STRATEGY (Not in DB)
            // If not found in DB, assume they are "Base" strategies (atr_breakout, etc.)
            // and rely on 'paramsPayload' to provide the settings.
            console.log(`[BotService] Strategies [${comboConfig.strategyCodes}] not in DB. Using Optimized/Base codes.`);
            
            strategiesPayload = comboConfig.strategyCodes.map(code => ({
                code: code,
                params: {} // Python will use the global 'paramsPayload' to fill gaps
            }));
        }
        
        // Apply Logic Rule
        if (comboConfig.combinationRule) {
            paramsPayload.hybridMode = comboConfig.combinationRule;
        }
        if (paramsPayload.hybridMode === 'REGIME') {
            paramsPayload.regime_threshold = params?.regime_threshold || 25; 
        }

    // --- CASE B: Single Strategy (Saved in DB) ---
    } else if (strategyId) {
        const strategy = await Strategy.findById(strategyId).lean();
        if (!strategy) throw new Error("Strategy not found in DB.");
        
        strategiesPayload = [{
            code: strategy.code,
            params: strategy.params
        }];
    }

    // 2. Construct Python Payload
    const pythonConfig = {
        symbol: symbol || "BTC-USD",
        timeframe: timeframe || "1h",
        capitalAllocation: capitalAllocation || 1000,
        mlMode: mlMode || "off",
        mlModel: mlModel || "",
        mlThreshold: mlThreshold || 0.5,
        isCombo: !!(comboConfig),
        strategies: strategiesPayload,
        params: paramsPayload
    };

    // 3. Call Python API to Start Bot
    console.log(`[BotService] Starting Python Bot for ${userId}...`);
    console.log(`[BotService] Mode: ${pythonConfig.mlMode}, Strategies: ${pythonConfig.strategies.length}`);
    
    const response = await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // 4. Update/Create Bot Record in Mongo
    let bot = await Bot.findOne({ userId });
    if (!bot) bot = new Bot({ userId });

    bot.symbol = pythonConfig.symbol;
    bot.timeframe = pythonConfig.timeframe;
    bot.status = 'running';
    bot.currentBalance = pythonConfig.capitalAllocation;
    bot.startedAt = new Date();
    bot.stoppedAt = null;
    bot.logs.push({ 
        timestamp: new Date(), 
        message: `Bot Started. Strategy: ${pythonConfig.strategies.map(s=>s.code).join('+')} | ML: ${pythonConfig.mlMode}`, 
        type: 'status' 
    });
    
    await bot.save();
    return bot;
}

/**
 * Stops the Live Bot on the Python Server.
 */
export async function stopTradingBot(userId) {
    console.log(`[BotService] Stopping Bot for ${userId}...`);
    
    // 1. Call Python API
    try {
        await callPythonApi('/api/bot/stop', 'POST');
    } catch (e) {
        console.warn("Python stop failed (bot might already be stopped), updating DB anyway.");
    }

    // 2. Update Mongo
    const bot = await Bot.findOne({ userId });
    if (bot) {
        bot.status = 'stopped';
        bot.stoppedAt = new Date();
        bot.logs.push({ timestamp: new Date(), message: "Bot Stopped.", type: 'status' });
        await bot.save();
    }
    return bot;
}

/**
 * Gets the status from the Python Server (Real-time) and updates Mongo.
 */
export async function getBotStatus(userId) {
    // 1. Get Mongo State
    const bot = await Bot.findOne({ userId }).lean();
    if (!bot) return { status: 'stopped', isConfigured: false };

    // 2. Get Python State (Live) if supposed to be running
    if (bot.status === 'running') {
        try {
            const liveStatus = await callPythonApi('/api/bot/status', 'GET');
            
            return {
                ...bot,
                currentBalance: liveStatus.currentBalance || bot.currentBalance,
                performanceMetrics: liveStatus.performanceMetrics || {},
                logs: liveStatus.logs || bot.logs, 
                candles: liveStatus.candles || [], 
                trades: liveStatus.trades || [],   
                isConfigured: true
            };
        } catch (e) {
            console.error(`[BotService] Failed to fetch live status: ${e.message}`);
            return { ...bot, isConfigured: true, error: "Live connection lost - showing last known state" };
        }
    }

    return { ...bot, isConfigured: true };
}

/**
 * Helper to get logs
 */
export async function getBotLogs(userId, limit = 50) {
    const bot = await Bot.findOne({ userId });
    if (!bot) return [];
    
    if (bot.status === 'running') {
        try {
            const liveStatus = await callPythonApi('/api/bot/logs', 'GET');
            return liveStatus || [];
        } catch (e) { return bot.logs; }
    }
    return bot.logs;
}
