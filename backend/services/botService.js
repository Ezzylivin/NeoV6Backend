// File: src/backend/services/botService.js
// 🚀 UPGRADE: v3.0 - SaaS Compatibility Layer
// 🛠 Fixes: Payload Mapping (Balance), Stop Logic, User ID Propagation

import axios from 'axios';
import https from 'https';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        const url = `${ML_SERVER_URL}${endpoint}`;
        const config = { method, url, data, httpsAgent, timeout: 10000 };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`[Python API Error] ${endpoint}:`, error.response?.data || error.message);
        throw error; // Rethrow to let the Controller handle the UI response
    }
}

export async function getWinnersList() {
    try {
        const list = await callPythonApi('/api/bot/winners', 'GET');
        return list || [];
    } catch (e) { return []; }
}

export async function startTradingBot(userId, config = {}) {
    if (!userId) throw new Error("Missing userId");

    // 1. Destructure Config
    const { 
        strategyId, symbol, timeframe, capitalAllocation, 
        comboConfig, mlMode, mlModel, mlThreshold, params, mode,
        riskManagementMode, riskPercentage, maxPyramiding, slippageBps // Capture new params
    } = config;

    let strategiesPayload = [];
    
    // 2. Resolve Strategies (Traffic Cop / Combo / Single)
    if (config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0) {
        strategiesPayload = config.strategies.map(s => ({ code: s.code, params: s.params || {} }));
    } 
    else if (comboConfig && comboConfig.strategyCodes?.length > 0) {
        // Attempt DB lookup for saved strategies, fallback to codes
        const dbStrategies = await Strategy.find({ userId: userId, code: { $in: comboConfig.strategyCodes } }).lean();
        if (dbStrategies.length > 0) {
            strategiesPayload = dbStrategies.map(s => ({ code: s.code, params: s.params }));
        } else {
            strategiesPayload = comboConfig.strategyCodes.map(code => ({ code: code, params: {} }));
        }
    } 
    else if (strategyId) {
        const strategy = await Strategy.findById(strategyId).lean();
        if (strategy) strategiesPayload = [{ code: strategy.code, params: strategy.params }];
    }

    if (strategiesPayload.length === 0) throw new Error("No valid strategies found.");

    // 3. Construct Python Payload (The "Translation" Step)
    const pythonConfig = {
        userId: userId,           // 🔑 Critical for Multi-User isolation
        mode: mode || 'paper',
        symbol: symbol || "BTC-USD",
        timeframe: timeframe || "1h",
        
        // 🛠 FIX: Map 'capitalAllocation' -> 'initialBalance' for Python
        initialBalance: capitalAllocation || 1000, 
        
        mlMode: mlMode || "off",
        mlModel: mlModel || "",
        mlThreshold: mlThreshold || 0.5,
        
        // Strategy Config
        isCombo: strategiesPayload.length > 1,
        strategies: strategiesPayload,
        comboConfig: comboConfig || {},
        
        // Risk & Execution Params (Pass explicit top-level args)
        riskManagementMode: riskManagementMode || 'static',
        riskPercentage: riskPercentage || 1,
        maxPyramiding: maxPyramiding || 1,
        slippageBps: slippageBps || 2.0, // Default 2 BPS
        
        // Legacy params support
        params: { hybridMode: 'AND', ...params }
    };

    // 4. Send Command to Python Engine
    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // 5. Update MongoDB State (So UI knows it's running)
    let bot = await Bot.findOne({ userId });
    if (!bot) bot = new Bot({ userId });

    bot.status = 'running';
    bot.mode = pythonConfig.mode;
    bot.symbol = pythonConfig.symbol;
    bot.timeframe = pythonConfig.timeframe;
    bot.currentBalance = pythonConfig.initialBalance; // Sync balance
    bot.startedAt = new Date();
    
    // Reset/Init Logs
    bot.logs = [{ 
        timestamp: new Date(), 
        message: `🚀 Bot Started: ${pythonConfig.symbol} (${pythonConfig.mode.toUpperCase()})`, 
        type: 'status' 
    }];
    
    await bot.save();
    return bot;
}

export async function stopTradingBot(userId) {
    if (!userId) throw new Error("Missing userId");

    // 🛠 FIX: Pass userId in body so Python knows WHO to stop
    try {
        await callPythonApi('/api/bot/stop', 'POST', { userId: userId });
    } catch (err) {
        console.warn("Python stop signal failed (Bot might be already stopped):", err.message);
    }

    const bot = await Bot.findOne({ userId });
    if (bot) {
        bot.status = 'stopped';
        bot.stoppedAt = new Date();
        bot.logs.push({ timestamp: new Date(), message: "🛑 Bot Stopped by User.", type: 'status' });
        await bot.save();
    }
    return bot;
}

export async function getBotStatus(userId) {
    const bot = await Bot.findOne({ userId }).lean();
    if (!bot) return { status: 'stopped', isConfigured: false };

    // Note: Python v79.1 doesn't have a polling endpoint yet. 
    // We return the MongoDB state which is updated by start/stop.
    // In v80, we can add a Python polling sync here.
    return { 
        ...bot, 
        isConfigured: true,
        // Ensure logs array exists
        logs: bot.logs || [] 
    };
}

export async function getBotLogs(userId) {
    const bot = await Bot.findOne({ userId });
    if (!bot) return [];
    return bot.logs || [];
}
