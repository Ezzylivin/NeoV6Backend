// File: services/botService.js
// 🚀 UPGRADE: Integrates with Python ML Server for Live Paper Trading & Optimization Results.

import axios from 'axios';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

// Configuration
const ML_SERVER_URL = "http://74.208.28.77:8000"; // Adjust if your Python server is elsewhere

// --- API Helper ---
async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        const url = `${ML_SERVER_URL}${endpoint}`;
        const config = { method, url, data };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`[Python API Error] ${endpoint}:`, error.message);
        throw new Error(`ML Server unavailable: ${error.message}`);
    }
}

/**
 * Fetches the list of all winning strategies.
 */
export async function getWinnersList() {
    try {
        const list = await callPythonApi('/api/ml/winners', 'GET');
        return list || [];
    } catch (e) {
        console.error("Failed to fetch winners list:", e);
        return [];
    }
}

/**
 * Starts the Live Paper Trading Bot on the Python Server.
 */
export async function startTradingBot(userId, config = {}) {
    if (!userId) throw new Error("Missing userId");
    const { strategyId, symbol, timeframe, capitalAllocation, comboConfig, mlMode, mlModel, mlThreshold } = config;

    // 1. Retrieve Full Strategy Details from DB
    let strategiesPayload = [];
    let paramsPayload = {
        hybridMode: 'AND', // Default
        ...config.params // Merge any overrides
    };

    if (comboConfig && comboConfig.strategyCodes?.length > 0) {
        // Combo Mode: Fetch all strategies involved
        const dbStrategies = await Strategy.find({ 
            userId: userId, 
            code: { $in: comboConfig.strategyCodes } 
        }).lean();

        if (dbStrategies.length === 0) throw new Error("Combo strategies not found in DB.");

        strategiesPayload = dbStrategies.map(s => ({
            code: s.code,
            params: s.params
        }));
        
        // Apply Combo Rules
        if (comboConfig.combinationRule === 'REGIME') {
            paramsPayload.hybridMode = 'REGIME';
            paramsPayload.regime_threshold = config.params?.regime_threshold || 25; 
        }

    } else if (strategyId) {
        // Single Mode: Fetch the one strategy
        const strategy = await Strategy.findById(strategyId).lean();
        if (!strategy) throw new Error("Strategy not found.");
        
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
        mlThreshold: mlThreshold || 0.65,
        isCombo: !!(comboConfig),
        strategies: strategiesPayload,
        params: paramsPayload
    };

    // 3. Call Python API to Start Bot
    console.log(`[BotService] Starting Python Bot for ${userId}...`);
    const response = await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // 4. Update/Create Bot Record in Mongo (for persistence)
    let bot = await Bot.findOne({ userId });
    if (!bot) bot = new Bot({ userId });

    bot.symbol = pythonConfig.symbol;
    bot.timeframe = pythonConfig.timeframe;
    bot.status = 'running';
    bot.currentBalance = pythonConfig.capitalAllocation;
    bot.startedAt = new Date();
    bot.stoppedAt = null;
    bot.logs.push({ timestamp: new Date(), message: `Bot Started via Python Engine. Response: ${response.status}`, type: 'status' });
    
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
        console.warn("Python stop failed, but updating DB anyway.");
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
    // 1. Get Mongo State (Static)
    const bot = await Bot.findOne({ userId }).lean();
    if (!bot) return { status: 'stopped', isConfigured: false };

    // 2. Get Python State (Live) if supposed to be running
    if (bot.status === 'running') {
        try {
            const liveStatus = await callPythonApi('/api/bot/status', 'GET');
            
            // Sync essential data back to Mongo occasionally? 
            // For now, we just return the live data merged with Mongo ID
            return {
                ...bot,
                currentBalance: liveStatus.currentBalance,
                position: liveStatus.position,
                performanceMetrics: liveStatus.performanceMetrics,
                logs: liveStatus.logs, // Python logs are fresher
                candles: liveStatus.candles, // 🚀 NEW: For Live Chart
                trades: liveStatus.trades,   // 🚀 NEW: For Live Chart
                isConfigured: true
            };
        } catch (e) {
            // If Python is down, return Mongo state with warning
            return { ...bot, isConfigured: true, error: "Live connection lost" };
        }
    }

    return { ...bot, isConfigured: true };
}

/**
 * Helper to get logs (fetches from DB if stopped, or Python if running)
 */
export async function getBotLogs(userId, limit = 50) {
    const bot = await Bot.findOne({ userId });
    if (!bot) return [];
    
    if (bot.status === 'running') {
        try {
            const liveStatus = await callPythonApi('/api/bot/status', 'GET');
            return liveStatus.logs || [];
        } catch (e) { return bot.logs; }
    }
    return bot.logs;
}
