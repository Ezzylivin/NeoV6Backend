// File: src/backend/services/botService.js
// 🚀 UPGRADE: v5.0 - Identity & Scope Fix
// 🛠 Fixes: Multi-Bot Collisions, Mongo Overwrites, Python API Scope

import axios from 'axios';
import https from 'https';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        let url = `${ML_SERVER_URL}${endpoint}`;
        // 🚀 UPGRADE: Pass botId in query for GET requests
        const queryParams = new URLSearchParams();
        if (method === 'GET') {
            if (data.userId) queryParams.append("userId", data.userId);
            if (data.botId) queryParams.append("botId", data.botId);
            if (queryParams.toString()) url += `?${queryParams.toString()}`;
        }

        const config = { method, url, data: method !== 'GET' ? data : undefined, httpsAgent, timeout: 15000 }; // Increased timeout
        const response = await axios(config);
        return response.data;
    } catch (error) {
        if (error.code !== 'ECONNREFUSED') {
            console.warn(`[Python API Warning] ${endpoint}: ${error.message}`);
        }
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

    // 🚀 CRITICAL: Generate Unique Bot ID (Deterministically)
    const cleanSymbol = (symbol || "BTC-USD").replace('/', '-');
    const botId = `${userId}_${cleanSymbol}_${timeframe || "1h"}`;

    // 2. Construct Python Payload
    const pythonConfig = {
        userId, 
        botId, // 🚀 Pass explicit ID to Python
        mode: mode || 'paper', 
        symbol: symbol || "BTC-USD", 
        timeframe: timeframe || "1h",
        initialBalance: Number(capitalAllocation) || 1000, 
        mlMode: mlMode || "off", mlModel: mlModel || "", mlThreshold: mlThreshold || 0.5,
        isCombo: strategiesPayload.length > 1, strategies: strategiesPayload, comboConfig: comboConfig || { combinationRule: 'AND' },
        riskManagementMode: riskManagementMode || 'static', riskPercentage: Number(riskPercentage) || 1,
        maxPyramiding: Number(maxPyramiding) || 1, slippageBps: Number(slippageBps) || 2.0,
        params: { hybridMode: 'AND', ...params }
    };

    // 3. Send to Python
    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // 4. UPSERT MongoDB State (Scoped by botId, NOT userId)
    const updateData = {
        userId, // Keep owner reference
        symbol: pythonConfig.symbol,
        timeframe: pythonConfig.timeframe,
        status: 'running',
        mode: pythonConfig.mode,
        capitalAllocation: pythonConfig.initialBalance,
        isCombo: pythonConfig.isCombo,
        strategies: strategiesPayload,
        comboConfig: pythonConfig.comboConfig,
        mlMode: pythonConfig.mlMode,
        riskPercentage: pythonConfig.riskPercentage,
        maxPyramiding: pythonConfig.maxPyramiding,
        startedAt: new Date()
    };

    // 🚀 FIX: Find by botId (Unique per bot), allowing multiple bots per user
    let bot = await Bot.findOneAndUpdate(
        { botId }, 
        { 
            $set: updateData,
            $push: { logs: { timestamp: new Date(), message: `🚀 Bot Started: ${pythonConfig.symbol}`, type: 'status' } }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return bot;
}

export async function stopTradingBot(userId, symbol, timeframe) {
    if (!userId) throw new Error("Missing userId");
    
    // Construct ID to stop specific bot
    // If symbol/tf missing, this might fail or we need logic to find active bots
    // For now, assuming UI passes them or we default to a "current" bot logic
    // (To be fully robust, the controller should pass symbol/timeframe)
    
    let query = { userId, status: 'running' };
    if (symbol && timeframe) {
        const cleanSymbol = symbol.replace('/', '-');
        query.botId = `${userId}_${cleanSymbol}_${timeframe}`;
    }

    const bot = await Bot.findOne(query);
    
    if (bot) {
        await callPythonApi('/api/bot/stop', 'POST', { botId: bot.botId });
        bot.status = 'stopped';
        bot.stoppedAt = new Date();
        bot.logs.unshift({ timestamp: new Date(), message: "🛑 Bot Stopped.", type: 'status' });
        await bot.save();
        return bot;
    }
    
    throw new Error("No running bot found to stop.");
}

export async function getBotStatus(userId, symbol, timeframe) {
    // 🚀 Construct ID to query specific bot status
    // If frontend doesn't pass symbol/tf yet, we fallback to finding *any* running bot for user
    let botId;
    if (symbol && timeframe) {
        botId = `${userId}_${symbol.replace('/', '-')}_${timeframe}`;
    } else {
        const active = await Bot.findOne({ userId, status: 'running' }).select('botId');
        if (active) botId = active.botId;
    }

    if (!botId) return { status: 'stopped', isConfigured: false, logs: [] };

    // 1. Ask Python directly using botId
    const liveStatus = await callPythonApi('/api/bot/status', 'GET', { botId });
    let bot = await Bot.findOne({ botId });

    if (liveStatus && liveStatus.status === 'running') {
        if (bot) {
            bot.status = 'running';
            bot.currentBalance = liveStatus.currentBalance; 
            if (liveStatus.performanceMetrics) bot.performanceMetrics = liveStatus.performanceMetrics;
            
            // Map Positions for UI
            const activePos = liveStatus.positions && liveStatus.positions.length > 0 
                ? { ...liveStatus.positions[0], side: 'long' } 
                : null;
            bot.currentPosition = activePos;
            
            await bot.save(); 
        }

        const logs = await callPythonApi('/api/bot/logs', 'GET', { botId });
        
        return { 
            ...bot.toObject(), 
            logs: logs || bot.logs, 
            trades: liveStatus.trades || [],
            positions: liveStatus.positions || [] 
        };
    } 
    else if (bot && bot.status === 'running') {
        // Self-Correction
        bot.status = 'stopped';
        bot.stoppedAt = new Date();
        bot.currentPosition = null; 
        await bot.save();
    }

    if (!bot) return { status: 'stopped', isConfigured: false, logs: [] };
    return { ...bot.toObject(), isConfigured: true };
}

export async function getBotLogs(userId, symbol, timeframe) {
    // Similar ID construction logic
    let botId;
    if (symbol && timeframe) {
        botId = `${userId}_${symbol.replace('/', '-')}_${timeframe}`;
    } else {
        const active = await Bot.findOne({ userId, status: 'running' }).select('botId');
        if (active) botId = active.botId;
    }
    
    if (!botId) return [];

    const liveLogs = await callPythonApi('/api/bot/logs', 'GET', { botId });
    if (liveLogs && liveLogs.length > 0) return liveLogs;

    const bot = await Bot.findOne({ botId });
    return bot ? bot.logs : [];
}
