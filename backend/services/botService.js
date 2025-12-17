// File: src/backend/services/botService.js
// 🚀 UPGRADE: v3.2 - Strategy Resolution Fix
// 🛠 Fixes: Empty strategies list in Python payload

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
        throw error; 
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

    console.log(`[Bot Start] Processing config for ${userId}...`);

    const { 
        strategyId, symbol, timeframe, capitalAllocation, 
        comboConfig, mlMode, mlModel, mlThreshold, params, mode,
        riskManagementMode, riskPercentage, maxPyramiding, slippageBps 
    } = config;

    let strategiesPayload = [];
    
    // --- STRATEGY RESOLUTION LOGIC ---
    
    // 1. Explicit Strategy List (e.g. from Traffic Cop)
    if (config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0) {
        strategiesPayload = config.strategies.map(s => ({ code: s.code, params: s.params || {} }));
    } 
    // 2. Combo Configuration (The case causing your issue)
    else if (comboConfig && Array.isArray(comboConfig.strategyCodes) && comboConfig.strategyCodes.length > 0) {
        console.log(`[Bot Start] Resolving Combo Strategies: ${comboConfig.strategyCodes.join(', ')}`);
        
        try {
            // Attempt DB lookup to get custom params if they exist
            const dbStrategies = await Strategy.find({ userId: userId, code: { $in: comboConfig.strategyCodes } }).lean();
            
            // Map codes to strategy objects
            strategiesPayload = comboConfig.strategyCodes.map(code => {
                const found = dbStrategies.find(s => s.code === code);
                return { 
                    code: code, 
                    params: found ? found.params : {} // Use saved params or default empty
                };
            });
        } catch (err) {
            console.warn("[Bot Start] Strategy lookup failed, using defaults:", err.message);
            // Fallback: Just use the codes with empty params
            strategiesPayload = comboConfig.strategyCodes.map(code => ({ code: code, params: {} }));
        }
    } 
    // 3. Single Strategy ID
    else if (strategyId) {
        const strategy = await Strategy.findById(strategyId).lean();
        if (strategy) strategiesPayload = [{ code: strategy.code, params: strategy.params }];
    }

    if (strategiesPayload.length === 0) {
        console.error("[Bot Start] Failed to resolve any strategies from config:", JSON.stringify(config, null, 2));
        throw new Error("No valid strategies found. Please select at least one strategy.");
    }

    console.log(`[Bot Start] Final Strategies Payload:`, JSON.stringify(strategiesPayload));

    // --- CONSTRUCT PYTHON PAYLOAD ---
    const pythonConfig = {
        userId: userId,
        mode: mode || 'paper',
        symbol: symbol || "BTC-USD",
        timeframe: timeframe || "1h",
        initialBalance: capitalAllocation || 1000, 
        mlMode: mlMode || "off",
        mlModel: mlModel || "",
        mlThreshold: mlThreshold || 0.5,
        
        // Critical: Ensure isCombo is true if multiple strategies exist
        isCombo: strategiesPayload.length > 1,
        strategies: strategiesPayload,
        
        // Pass comboConfig, ensuring defaults
        comboConfig: comboConfig || { combinationRule: 'AND' },
        
        riskManagementMode: riskManagementMode || 'static',
        riskPercentage: riskPercentage || 1,
        maxPyramiding: maxPyramiding || 1,
        slippageBps: slippageBps || 2.0,
        params: { hybridMode: 'AND', ...params }
    };

    // --- SEND TO PYTHON ---
    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // --- UPDATE MONGODB ---
    let bot = await Bot.findOne({ userId });
    if (!bot) bot = new Bot({ userId });

    bot.status = 'running';
    bot.mode = pythonConfig.mode;
    bot.symbol = pythonConfig.symbol;
    bot.timeframe = pythonConfig.timeframe;
    bot.capitalAllocation = pythonConfig.initialBalance;
    bot.currentBalance = pythonConfig.initialBalance;
    
    // Save the resolved strategies so the DB reflects reality
    bot.strategies = strategiesPayload; 
    bot.isCombo = pythonConfig.isCombo;
    bot.comboConfig = pythonConfig.comboConfig;
    
    bot.startedAt = new Date();
    bot.logs = [{ 
        timestamp: new Date(), 
        message: `🚀 Bot Started: ${pythonConfig.symbol} (${pythonConfig.mode.toUpperCase()}) with ${strategiesPayload.length} strategies.`, 
        type: 'status' 
    }];
    
    await bot.save();
    return bot;
}

export async function stopTradingBot(userId) {
    if (!userId) throw new Error("Missing userId");

    try {
        await callPythonApi('/api/bot/stop', 'POST', { userId: userId });
    } catch (err) {
        console.warn("Python stop signal failed:", err.message);
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

    return { 
        ...bot, 
        isConfigured: true,
        logs: bot.logs || [] 
    };
}

export async function getBotLogs(userId) {
    const bot = await Bot.findOne({ userId });
    if (!bot) return [];
    return bot.logs || [];
}
