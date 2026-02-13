// File: backend/services/botService.js
// 🚀 UPGRADE: v11.8 - Shorting Permission Persistence (Fixes "Spot Only" Safety Lock)
import axios from "axios";
import https from 'https';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        let url = `${ML_SERVER_URL}${endpoint}`;
        const queryParams = new URLSearchParams();
        if (method === 'GET') {
            if (data.userId) queryParams.append("userId", data.userId);
            if (data.botId) queryParams.append("botId", data.botId);
            if (queryParams.toString()) url += `?${queryParams.toString()}`;
        }

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
        console.error(`[Python API Error] ${endpoint}:`, error.message);
        return null; 
    }
}

async function resolveStrategies(userId, config) {
    if (config.strategies?.length > 0) return config.strategies.map(s => ({ code: s.code, params: s.params || {} }));
    
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

export async function startTradingBot(userId, incomingData = {}) {
    console.log(`\n🚨 START BOT REQUEST: ${userId}`);
    if (!userId) throw new Error("Missing userId");

    const config = incomingData.config || incomingData;

    // 1. Core Logic Fallbacks
    const symbol = (config.symbol || "BTC-USD").replace('/', '-').toUpperCase();
    const timeframe = config.timeframe || "1h";
    const capital = Number(config.capitalAllocation) || 1000;
    
    // 🟢 CRITICAL FIX: Explicitly extract enable_shorting from incoming payload
    const enableShorting = config.enable_shorting === true || config.enable_shorting === 'true';

    const strategiesPayload = await resolveStrategies(userId, config);
    const botId = `${userId}_${symbol}_${timeframe}`;

    const rawConfig = {
        botId,
        mode: config.mode || 'paper', 
        symbol, 
        timeframe,
        enable_shorting: enableShorting, // 🟢 PASS TO PYTHON
        initialBalance: capital, 
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

    // 2. Call Python Engine
    const pythonPayload = { userId: userId, config: rawConfig };
    await callPythonApi('/api/bot/start', 'POST', pythonPayload);

    // 3. Prepare DB Payload
    const updateData = {
        symbol,
        timeframe,
        enable_shorting: enableShorting, // 🟢 PERSIST TO DB
        status: 'running',
        mode: rawConfig.mode,
        capitalAllocation: capital,
        currentBalance: capital, 
        isCombo: rawConfig.isCombo,
        strategies: strategiesPayload,
        comboConfig: rawConfig.comboConfig,
        mlMode: rawConfig.mlMode,
        startedAt: new Date(),
        stoppedAt: null,
        candles: [], 
        equityCurve: []
    };

    // 4. Atomic DB Update
    return await Bot.findOneAndUpdate(
        { userId }, 
        { 
            $set: updateData,
            $setOnInsert: { lastActive: new Date() },
            $push: { logs: { timestamp: new Date(), message: `🚀 Bot Started: ${symbol} (${enableShorting ? 'MARGIN' : 'SPOT'})`, type: 'status' } }
        },
        { new: true, upsert: true, runValidators: false }
    );
}

export async function stopTradingBot(userId) {
    if (!userId) throw new Error("Missing userId");
    try { await callPythonApi('/api/bot/stop', 'POST', { userId }); } catch (err) {}
    return await Bot.findOneAndUpdate({ userId }, { status: 'stopped', stoppedAt: new Date() }, { new: true });
}

export async function resetBotController(userId, config) {
    try { await callPythonApi('/api/bot/reset', 'POST', { userId, ...config }); } catch (e) {}
    return await Bot.findOneAndUpdate({ userId }, { status: 'stopped', currentBalance: config.capitalAllocation || 1000, equityCurve: [], tradeHistory: [], activePositions: [], logs: [], candles: [] }, { new: true });
}

export async function getBotStatus(userId) {
    const liveStatus = await callPythonApi('/api/bot/status', 'GET', { userId }); 
    let dbBot = await Bot.findOne({ userId });

    if (liveStatus && (liveStatus.status === 'running' || liveStatus.status === 'initializing')) {
        if (!dbBot || dbBot.status !== 'running') {
            console.log(`[Self-Heal] Resyncing DB for ${userId}...`);
            dbBot = await Bot.findOneAndUpdate(
                { userId }, 
                { 
                    $set: { 
                        status: 'running', 
                        lastActive: new Date(),
                        symbol: liveStatus.symbol || "BTC-USD",
                        capitalAllocation: liveStatus.currentBalance || 1000 
                    }
                },
                { new: true, upsert: true, runValidators: false }
            );
        }

        return { 
            ...dbBot.toObject(), 
            status: 'running', 
            candles: liveStatus.candles || dbBot.candles || [], 
            equityCurve: liveStatus.equityCurve || dbBot.equityCurve || [],
            logs: liveStatus.logs || dbBot.logs || [],
            currentBalance: liveStatus.currentBalance || dbBot.currentBalance
        };
    }

    if ((!liveStatus || liveStatus.status === 'stopped') && (!dbBot || dbBot.status === 'stopped')) {
        return { status: 'stopped', isConfigured: !!dbBot, logs: dbBot?.logs || [] };
    }

    return dbBot ? dbBot.toObject() : { status: 'stopped', logs: [] };
}

export async function getBotLogs(userId, limit) {
    const active = await Bot.findOne({ userId, status: 'running' });
    if (!active) return [];
    return active.logs;
}

export async function getWinnersList() {
    const rawWinners = await callPythonApi('/api/bot/winners', 'GET');
    if (!Array.isArray(rawWinners)) return [];
    return rawWinners.map(w => ({ ...w.config, botId: w.config.botId || w.id, roi: parseFloat(w.roi || 0) }));
}
