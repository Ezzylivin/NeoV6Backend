// File: src/backend/services/botService.js

import axios from 'axios';
import https from 'https';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

// 🟢 CONFIG: Your Python VPS Engine
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- Helper for calling Python ---
async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        let url = `${ML_SERVER_URL}${endpoint}`;
        
        // Construct Query Params for GET requests
        const queryParams = new URLSearchParams();
        if (method === 'GET') {
            if (data.userId) queryParams.append("userId", data.userId);
            if (data.botId) queryParams.append("botId", data.botId);
            if (queryParams.toString()) url += `?${queryParams.toString()}`;
        }

        console.log(`[BotService] ${method} -> ${url}`);

        const config = { 
            method, 
            url, 
            data: method !== 'GET' ? data : undefined, 
            httpsAgent, 
            timeout: 15000 
        };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        if (error.code !== 'ECONNREFUSED') {
            console.warn(`[Python API Warning] ${endpoint}: ${error.message}`);
        }
        return null; // Return null so controllers handle it gracefully
    }
}

// --- Strategy Resolver Helper ---
async function resolveStrategies(userId, config) {
    if (config.strategies?.length > 0) return config.strategies.map(s => ({ code: s.code, params: s.params || {} }));
    
    // Handle Combo Configs
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
    
    // Handle Single Strategy ID
    if (config.strategyId) {
        const strategy = await Strategy.findById(config.strategyId).lean();
        if (strategy) return [{ code: strategy.code, params: strategy.params }];
    }
    return [];
}

// ---------------------------------------------------------
// 🚀 EXPORTED FUNCTIONS (Called by Controller)
// ---------------------------------------------------------

export async function getWinnersList() {
    // 🟢 FIX: Call Python VPS instead of reading local file system
    const winners = await callPythonApi('/api/bot/winners', 'GET');
    return Array.isArray(winners) ? winners : [];
}

export async function startTradingBot(userId, config = {}) {
    if (!userId) throw new Error("Missing userId");

    // 1. Resolve Strategies
    const strategiesPayload = await resolveStrategies(userId, config);
    if (strategiesPayload.length === 0) throw new Error("No valid strategies found.");

    const cleanSymbol = (config.symbol || "BTC-USD").replace('/', '-');
    const botId = `${userId}_${cleanSymbol}_${config.timeframe || "1h"}`;

    // 2. Prepare Python Payload
    const pythonConfig = {
        userId, 
        botId,
        mode: config.mode || 'paper', 
        symbol: config.symbol || "BTC-USD", 
        timeframe: config.timeframe || "1h",
        initialBalance: Number(config.capitalAllocation) || 1000, 
        mlMode: config.mlMode || "off",
        mlModel: config.mlModel || "",
        mlThreshold: config.mlThreshold || 0.5,
        isCombo: strategiesPayload.length > 1,
        strategies: strategiesPayload,
        comboConfig: config.comboConfig || { combinationRule: 'AND' },
        riskManagementMode: config.riskManagementMode || 'static',
        riskPercentage: Number(config.riskPercentage) || 1,
        maxPyramiding: Number(config.maxPyramiding) || 1,
        slippageBps: Number(config.slippageBps) || 2.0,
        params: { hybridMode: 'AND', ...config.params }
    };

    // 3. Start on Python
    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // 4. Update Node.js DB
    const updateData = {
        userId,
        symbol: pythonConfig.symbol,
        timeframe: pythonConfig.timeframe,
        status: 'running',
        mode: pythonConfig.mode,
        capitalAllocation: pythonConfig.initialBalance,
        isCombo: pythonConfig.isCombo,
        strategies: strategiesPayload,
        comboConfig: pythonConfig.comboConfig,
        mlMode: pythonConfig.mlMode,
        startedAt: new Date()
    };

    return await Bot.findOneAndUpdate(
        { botId }, 
        { 
            $set: updateData,
            $push: { logs: { timestamp: new Date(), message: `🚀 Bot Started: ${pythonConfig.symbol}`, type: 'status' } }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

export async function stopTradingBot(userId) {
    if (!userId) throw new Error("Missing userId");
    
    // Find any running bot for this user (Simplified for single-bot per user logic)
    // Or you can enhance this to require botId if managing multiple
    const bot = await Bot.findOne({ userId, status: 'running' });
    
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

export async function getBotStatus(userId) {
    // Find active bot ID from Node DB
    const active = await Bot.findOne({ userId, status: 'running' }).select('botId');
    if (!active) return { status: 'stopped', isConfigured: false, logs: [] };

    // Ask Python for live stats
    const liveStatus = await callPythonApi('/api/bot/status', 'GET', { botId: active.botId });
    
    // Sync Node DB if needed (Optional but good for consistency)
    let bot = await Bot.findOne({ botId: active.botId });

    if (liveStatus && liveStatus.status === 'running') {
        if (bot) {
            bot.currentBalance = liveStatus.currentBalance;
            // ... (sync other fields if desired)
            await bot.save();
        }
        
        // Fetch logs separately
        const logs = await callPythonApi('/api/bot/logs', 'GET', { botId: active.botId });

        return { 
            ...bot.toObject(), 
            logs: logs || bot.logs, 
            trades: liveStatus.trades || [],
            positions: liveStatus.positions || [],
            candles: liveStatus.candles || [] 
        };
    } 
    
    // If Python says stopped but Node says running
    if (bot && bot.status === 'running') {
        bot.status = 'stopped';
        await bot.save();
    }

    return { status: 'stopped', isConfigured: false, logs: [] };
}

export async function getBotLogs(userId, limit) {
    const active = await Bot.findOne({ userId, status: 'running' });
    if (!active) return [];
    const logs = await callPythonApi('/api/bot/logs', 'GET', { botId: active.botId });
    return Array.isArray(logs) ? logs : [];
}
