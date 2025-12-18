// File: src/backend/services/botService.js
// 🚀 UPGRADE: v5.1 - Fixes Data Loss & "Zombie Bot" Parameters
// 🛠 Fixes: Strict Strategy Resolution, Deep Param Copying, Input Validation

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

        const config = { method, url, data: method !== 'GET' ? data : undefined, httpsAgent, timeout: 15000 };
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
    // 1. Priority: Explicit strategies passed from Frontend (Custom/Optimization results)
    if (config.strategies && config.strategies.length > 0) {
        console.log(`[BotStart] Using explicit strategies from payload: ${config.strategies.length}`);
        return config.strategies.map(s => ({ 
            code: s.code, 
            // FIX: Ensure params object is copied, default to empty only if strictly undefined
            params: s.params || {} 
        }));
    } 

    // 2. Fallback: Look up in DB (Saved Strategy from Library)
    if (config.comboConfig?.strategyCodes?.length > 0) {
        console.log(`[BotStart] Attempting to hydrate strategies from DB: ${config.comboConfig.strategyCodes}`);
        
        try {
            const dbStrategies = await Strategy.find({ userId: userId, code: { $in: config.comboConfig.strategyCodes } }).lean();
            
            return config.comboConfig.strategyCodes.map(code => {
                const found = dbStrategies.find(s => s.code === code);
                
                // 🛑 CRITICAL FIX: Do not allow empty params for a Combo Strategy!
                if (!found) {
                    throw new Error(`Missing configuration for strategy '${code}'. Please Save the strategy to your Library before running.`);
                }
                
                return { code: code, params: found.params };
            });
        } catch (err) {
            // Rethrow specific errors, otherwise log generic
            if (err.message.includes("Missing configuration")) throw err;
            console.error("Strategy Resolution Error:", err);
            throw new Error("Failed to resolve strategy configurations from Database.");
        }
    } 

    // 3. Single Strategy ID lookup
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

    // 🔍 DEBUG: Log incoming config to catch Frontend dropping data
    console.log(`[BotStart] Received Config for ${config.symbol}:`, {
        strategiesCount: config.strategies?.length,
        hasCombo: !!config.comboConfig,
        risk: config.riskPercentage,
        mlMode: config.mlMode
    });

    const { symbol, timeframe, capitalAllocation, comboConfig, mlMode, mlModel, mlThreshold, params, mode, riskManagementMode, riskPercentage, maxPyramiding, slippageBps } = config;

    // 1. Resolve Strategies (Now throws error if params are missing)
    const strategiesPayload = await resolveStrategies(userId, config);
    if (strategiesPayload.length === 0) throw new Error("No valid strategies found. Please select a Strategy or Combo.");

    // 🚀 CRITICAL: Generate Unique Bot ID (Deterministically)
    const cleanSymbol = (symbol || "BTC-USD").replace('/', '-');
    const botId = `${userId}_${cleanSymbol}_${timeframe || "1h"}`;

    // 2. Construct Python Payload
    const pythonConfig = {
        userId, 
        botId,
        mode: mode || 'paper', 
        symbol: symbol || "BTC-USD", 
        timeframe: timeframe || "1h",
        initialBalance: Number(capitalAllocation) || 1000, 
        mlMode: mlMode || "off",
        mlModel: mlModel || "",
        mlThreshold: mlThreshold || 0.5,
        isCombo: strategiesPayload.length > 1,
        strategies: strategiesPayload,
        comboConfig: comboConfig || { combinationRule: 'AND' },
        riskManagementMode: riskManagementMode || 'static',
        riskPercentage: Number(riskPercentage) || 1,
        maxPyramiding: Number(maxPyramiding) || 1,
        slippageBps: Number(slippageBps) || 2.0,
        params: { hybridMode: 'AND', ...params }
    };

    // 3. Send to Python
    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // 4. UPSERT MongoDB State (Scoped by botId)
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
        mlModel: pythonConfig.mlModel, // ✅ Persist Model Name
        riskPercentage: pythonConfig.riskPercentage,
        maxPyramiding: pythonConfig.maxPyramiding,
        startedAt: new Date()
    };

    let bot = await Bot.findOneAndUpdate(
        { botId }, 
        { 
            $set: updateData,
            $push: { logs: { timestamp: new Date(), message: `🚀 Bot Started: ${pythonConfig.symbol} [Risk: ${pythonConfig.riskPercentage}%]`, type: 'status' } }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return bot;
}

export async function stopTradingBot(userId, symbol, timeframe) {
    if (!userId) throw new Error("Missing userId");
    
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
    let botId;
    if (symbol && timeframe) {
        botId = `${userId}_${symbol.replace('/', '-')}_${timeframe}`;
    } else {
        const active = await Bot.findOne({ userId, status: 'running' }).select('botId');
        if (active) botId = active.botId;
    }

    if (!botId) return { status: 'stopped', isConfigured: false, logs: [] };

    const liveStatus = await callPythonApi('/api/bot/status', 'GET', { botId });
    let bot = await Bot.findOne({ botId });

    if (liveStatus && liveStatus.status === 'running') {
        if (bot) {
            bot.status = 'running';
            bot.currentBalance = liveStatus.currentBalance;

            if (liveStatus.performanceMetrics) {
                bot.performanceMetrics = liveStatus.performanceMetrics;
            }

            // ✅ FIXED: Aggregate multi-position state safely
            if (liveStatus.positions && liveStatus.positions.length > 0) {
                const totalSize = liveStatus.positions.reduce((s, p) => s + p.size, 0);
                const weightedEntry = liveStatus.positions.reduce(
                    (s, p) => s + p.entryPrice * p.size, 0
                ) / totalSize;

                const totalPnl = liveStatus.positions.reduce((s, p) => s + (p.pnl || 0), 0);

                bot.currentPosition = {
                    entryPrice: weightedEntry,
                    size: totalSize,
                    side: 'long',
                    entryTime: liveStatus.positions[0].entryTime,
                    pnl: totalPnl
                };
            } else {
                bot.currentPosition = null;
            }

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
        bot.status = 'stopped';
        bot.stoppedAt = new Date();
        bot.currentPosition = null;
        await bot.save();
    }

    if (!bot) return { status: 'stopped', isConfigured: false, logs: [] };
    return { ...bot.toObject(), isConfigured: true };
}

export async function getBotLogs(userId, symbol, timeframe) {
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
