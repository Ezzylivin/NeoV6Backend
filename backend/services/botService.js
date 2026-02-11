// File: backend/services/botService.js
// 🚀 UPGRADE: v11.5 - Conflict Resolution (Fixes "Updating path userId" Conflict)
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

    if (!config.symbol || !config.timeframe || !config.capitalAllocation) {
        throw new Error("Missing required fields: symbol, timeframe, or capitalAllocation.");
    }

    const strategiesPayload = await resolveStrategies(userId, config);
    const cleanSymbol = (config.symbol || "BTC-USD").replace('/', '-').toUpperCase();
    const botId = `${userId}_${cleanSymbol}_${config.timeframe || "1h"}`;

    const rawConfig = {
        botId,
        mode: config.mode || 'paper', 
        symbol: cleanSymbol, 
        timeframe: config.timeframe,
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

    const pythonPayload = { userId: userId, config: rawConfig };
    await callPythonApi('/api/bot/start', 'POST', pythonPayload);

    let initialCandles = [];
    let initialEquity = [];
    
    console.log("⏳ Waiting for Python data sync...");
    
    for (let i = 1; i <= 8; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        const liveState = await callPythonApi('/api/bot/status', 'GET', { userId });
        
        if (liveState && liveState.candles && liveState.candles.length > 0) {
            initialCandles = liveState.candles;
            initialEquity = liveState.equityCurve || [];
            console.log(`   ✅ Data Acquired: ${initialCandles.length} candles.`);
            break; 
        }
    }

    const updateData = {
        // userId removed from $set/payload to avoid MongoDB conflict error
        symbol: cleanSymbol,
        timeframe: rawConfig.timeframe,
        status: 'running',
        mode: rawConfig.mode,
        capitalAllocation: Number(rawConfig.initialBalance),
        currentBalance: Number(rawConfig.initialBalance), 
        isCombo: rawConfig.isCombo,
        strategies: strategiesPayload,
        comboConfig: rawConfig.comboConfig,
        mlMode: rawConfig.mlMode,
        startedAt: new Date(),
        stoppedAt: null,
        candles: initialCandles,
        equityCurve: initialEquity
    };

    return await Bot.findOneAndUpdate(
        { botId }, // userId is implicitly part of botId
        { 
            $set: updateData,
            $setOnInsert: { 
                // Removed userId here to resolve conflict error
                symbol: cleanSymbol, 
                capitalAllocation: Number(rawConfig.initialBalance) 
            },
            $push: { logs: { timestamp: new Date(), message: `🚀 Bot Started: ${cleanSymbol}`, type: 'status' } }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
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
            console.log(`[Self-Heal] Resyncing DB for ${userId}. Fixing state...`);
            dbBot = await Bot.findOneAndUpdate(
                { userId }, // Use userId as the query only
                { 
                    $set: { status: 'running', lastActive: new Date() },
                    $setOnInsert: { 
                        // Do not include userId in $setOnInsert to avoid conflict
                        symbol: liveStatus.symbol || "UNKNOWN", 
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
