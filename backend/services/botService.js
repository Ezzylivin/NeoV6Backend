// File: src/backend/services/botService.js
// 🚀 UPGRADE: v3.6 - The Final Connector
// 🛠 Fixes: MongoDB Validation Crash, Real-Time Status Sync

import axios from 'axios';
import https from 'https';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        let url = `${ML_SERVER_URL}${endpoint}`;
        if (method === 'GET' && data.userId) url += `?userId=${data.userId}`;

        const config = { method, url, data: method !== 'GET' ? data : undefined, httpsAgent, timeout: 5000 };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.warn(`[Python API Warning] ${endpoint}: ${error.message}`);
        return null;
    }
}

// --- HELPER: Universal Strategy Resolver ---
async function resolveStrategies(userId, config) {
    if (config.strategies?.length > 0) {
        return config.strategies.map(s => ({ code: s.code, params: s.params || {} }));
    } 
    if (config.comboConfig?.strategyCodes?.length > 0) {
        try {
            const dbStrategies = await Strategy.find({ userId: userId, code: { $in: config.comboConfig.strategyCodes } }).lean();
            return config.comboConfig.strategyCodes.map(code => {
                const found = dbStrategies.find(s => s.code === code);
                return { code: code, params: found ? found.params : {} };
            });
        } catch (err) {
            return config.comboConfig.strategyCodes.map(code => ({ code: code, params: {} }));
        }
    } 
    if (config.strategyId) {
        const strategy = await Strategy.findById(config.strategyId).lean();
        if (strategy) return [{ code: strategy.code, params: strategy.params }];
    }
    return [];
}

export async function getWinnersList() {
    try {
        const list = await callPythonApi('/api/bot/winners', 'GET');
        return list || [];
    } catch (e) { return []; }
}

export async function startTradingBot(userId, config = {}) {
    if (!userId) throw new Error("Missing userId");

    const { symbol, timeframe, capitalAllocation, comboConfig, mlMode, mlModel, mlThreshold, params, mode, riskManagementMode, riskPercentage, maxPyramiding, slippageBps } = config;

    // 1. Resolve Strategies
    const strategiesPayload = await resolveStrategies(userId, config);
    if (strategiesPayload.length === 0) throw new Error("No valid strategies found.");

    // 2. Construct Python Payload
    const pythonConfig = {
        userId, mode: mode || 'paper', symbol: symbol || "BTC-USD", timeframe: timeframe || "1h",
        initialBalance: Number(capitalAllocation) || 1000, 
        mlMode: mlMode || "off", mlModel: mlModel || "", mlThreshold: mlThreshold || 0.5,
        isCombo: strategiesPayload.length > 1, strategies: strategiesPayload, comboConfig: comboConfig || { combinationRule: 'AND' },
        riskManagementMode: riskManagementMode || 'static', riskPercentage: Number(riskPercentage) || 1,
        maxPyramiding: Number(maxPyramiding) || 1, slippageBps: Number(slippageBps) || 2.0,
        params: { hybridMode: 'AND', ...params }
    };

    // 3. Send to Python
    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // 4. Update MongoDB (With CRITICAL FIX)
    await Bot.deleteMany({ userId }); 
    const bot = new Bot({
        userId, 
        botId: `${userId}_${pythonConfig.symbol}_${pythonConfig.timeframe}`,
        symbol: pythonConfig.symbol, 
        timeframe: pythonConfig.timeframe, 
        status: 'running', 
        mode: pythonConfig.mode,
        
        // 🚀 FIX: Must set capitalAllocation to pass Schema validation
        capitalAllocation: pythonConfig.initialBalance, 
        currentBalance: pythonConfig.initialBalance,
        
        isCombo: pythonConfig.isCombo, 
        strategies: strategiesPayload, 
        comboConfig: pythonConfig.comboConfig, 
        mlMode: pythonConfig.mlMode,
        riskPercentage: pythonConfig.riskPercentage, 
        maxPyramiding: pythonConfig.maxPyramiding,
        startedAt: new Date(),
        logs: [{ timestamp: new Date(), message: `🚀 Bot Started: ${pythonConfig.symbol}`, type: 'status' }]
    });

    try { 
        await bot.save(); 
        return bot; 
    } catch (e) { 
        console.error("Mongo Save Error:", e.message);
        // Stop python if DB save fails to keep state synced
        await callPythonApi('/api/bot/stop', 'POST', { userId }); 
        throw new Error(`Database Error: ${e.message}`); 
    }
}

export async function stopTradingBot(userId) {
    if (!userId) throw new Error("Missing userId");
    await callPythonApi('/api/bot/stop', 'POST', { userId });

    const bot = await Bot.findOne({ userId });
    if (bot) {
        bot.status = 'stopped';
        bot.stoppedAt = new Date();
        bot.logs.unshift({ timestamp: new Date(), message: "🛑 Bot Stopped.", type: 'status' });
        await bot.save();
    }
    return bot;
}

// 🚀 UPGRADE: Real-Time Polling
export async function getBotStatus(userId) {
    // 1. Ask Python directly: "Are you running?"
    const liveStatus = await callPythonApi('/api/bot/status', 'GET', { userId });
    let bot = await Bot.findOne({ userId });

    if (liveStatus && liveStatus.status === 'running') {
        // If Python is running, ensure Mongo matches
        if (!bot) bot = new Bot({ userId, symbol: liveStatus.symbol, timeframe: liveStatus.timeframe, capitalAllocation: 1000 });
        
        bot.status = 'running';
        bot.currentBalance = liveStatus.currentBalance;
        
        // 🚀 UPGRADE: Get Live Logs
        const logs = await callPythonApi('/api/bot/logs', 'GET', { userId });
        
        return { 
            ...bot.toObject(), 
            logs: logs || bot.logs, 
            trades: liveStatus.trades || [],
            positions: liveStatus.positions || []
        };
    } 
    else if (bot && bot.status === 'running') {
        // Self-Correction: If Python died, mark Mongo as stopped
        bot.status = 'stopped';
        bot.stoppedAt = new Date();
        await bot.save();
    }

    if (!bot) return { status: 'stopped', isConfigured: false, logs: [] };
    return { ...bot.toObject(), isConfigured: true };
}

export async function getBotLogs(userId) {
    const liveLogs = await callPythonApi('/api/bot/logs', 'GET', { userId });
    if (liveLogs && liveLogs.length > 0) return liveLogs;

    const bot = await Bot.findOne({ userId });
    return bot ? bot.logs : [];
}
