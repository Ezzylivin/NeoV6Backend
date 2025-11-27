// File: src/backend/services/botService.js
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
        console.error(`[Python API Error] ${endpoint}:`, error.message);
        return null; 
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
    const { strategyId, symbol, timeframe, capitalAllocation, comboConfig, mlMode, mlModel, mlThreshold, params } = config;

    let strategiesPayload = [];
    let paramsPayload = { hybridMode: 'AND', ...params };

    // 1. Use Explicit Strategies (From Golden/Traffic Cop)
    if (config.strategies && Array.isArray(config.strategies) && config.strategies.length > 0) {
        strategiesPayload = config.strategies.map(s => ({ code: s.code, params: s.params || {} }));
    } 
    // 2. Use Combo Config (DB Lookup)
    else if (comboConfig && comboConfig.strategyCodes?.length > 0) {
        const dbStrategies = await Strategy.find({ userId: userId, code: { $in: comboConfig.strategyCodes } }).lean();
        if (dbStrategies.length > 0) {
            strategiesPayload = dbStrategies.map(s => ({ code: s.code, params: s.params }));
        } else {
            strategiesPayload = comboConfig.strategyCodes.map(code => ({ code: code, params: {} }));
        }
        if (comboConfig.combinationRule) paramsPayload.hybridMode = comboConfig.combinationRule;
    } 
    // 3. Single Strategy
    else if (strategyId) {
        const strategy = await Strategy.findById(strategyId).lean();
        if (strategy) strategiesPayload = [{ code: strategy.code, params: strategy.params }];
    }

    if (strategiesPayload.length === 0) throw new Error("No valid strategies found.");

    const pythonConfig = {
        symbol: symbol || "BTC-USD",
        timeframe: timeframe || "1h",
        capitalAllocation: capitalAllocation || 1000,
        mlMode: mlMode || "off",
        mlModel: mlModel || "",
        mlThreshold: mlThreshold || 0.5,
        isCombo: strategiesPayload.length > 1,
        strategies: strategiesPayload,
        params: paramsPayload
    };

    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    let bot = await Bot.findOne({ userId });
    if (!bot) bot = new Bot({ userId });

    bot.status = 'running';
    bot.symbol = pythonConfig.symbol;
    bot.timeframe = pythonConfig.timeframe;
    bot.currentBalance = pythonConfig.capitalAllocation;
    bot.startedAt = new Date();
    bot.logs.push({ timestamp: new Date(), message: `Bot Started. Strategies: ${strategiesPayload.length}`, type: 'status' });
    
    await bot.save();
    return bot;
}

export async function stopTradingBot(userId) {
    await callPythonApi('/api/bot/stop', 'POST');
    const bot = await Bot.findOne({ userId });
    if (bot) {
        bot.status = 'stopped';
        bot.stoppedAt = new Date();
        bot.logs.push({ timestamp: new Date(), message: "Bot Stopped.", type: 'status' });
        await bot.save();
    }
    return bot;
}

export async function getBotStatus(userId) {
    const bot = await Bot.findOne({ userId }).lean();
    if (!bot) return { status: 'stopped', isConfigured: false };

    if (bot.status === 'running') {
        const liveStatus = await callPythonApi('/api/bot/status', 'GET');
        if (liveStatus) {
            return {
                ...bot,
                currentBalance: liveStatus.currentBalance || bot.currentBalance,
                trades: liveStatus.trades || [],
                logs: (liveStatus.logs && liveStatus.logs.length > 0) ? liveStatus.logs : bot.logs,
                candles: liveStatus.candles || [],
                performanceMetrics: liveStatus.performanceMetrics || {},
                isConfigured: true
            };
        }
    }
    return { ...bot, isConfigured: true };
}

// 🚀 CRITICAL FIX: Ensure this function is exported!
export async function getBotLogs(userId) {
    const bot = await Bot.findOne({ userId });
    if (!bot) return [];
    
    // If running, try to get live logs, otherwise return DB logs
    if (bot.status === 'running') {
        try {
            const liveStatus = await callPythonApi('/api/bot/logs', 'GET');
            if (liveStatus && Array.isArray(liveStatus)) return liveStatus;
        } catch (e) {}
    }
    return bot.logs;
}
