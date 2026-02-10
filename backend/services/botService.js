// File: src/backend/services/botService.js
// 🚀 UPGRADE: v9.9 - Fixed Race Condition (Waits for Data)
import axios from "axios";
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
        return null; 
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
// 🚀 EXPORTED FUNCTIONS
// ---------------------------------------------------------

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

    console.log(`[BotService] 🚀 Initializing Bot ${botId} on Python...`);

    // 3. Start on Python (This triggers the data fetch on VPS)
    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    // 🟢 3.5. SMART RETRY LOOP (The Fix)
    // Python needs 1-2 seconds to fetch data from Coinbase. We wait for it.
    let initialCandles = [];
    let initialEquity = [];
    
    // Try up to 4 times (total ~6 seconds max)
    for (let i = 1; i <= 4; i++) {
        console.log(`[BotService] ⏳ Sync Attempt ${i}/4 (Waiting for Python data)...`);
        
        // Wait 1.5 seconds before asking
        await new Promise(resolve => setTimeout(resolve, 1500)); 

        try {
            const liveState = await callPythonApi('/api/bot/status', 'GET', { userId });
            
            if (liveState && liveState.candles && liveState.candles.length > 0) {
                console.log(`[BotService] ✅ Success! Received ${liveState.candles.length} candles.`);
                initialCandles = liveState.candles;
                initialEquity = liveState.equityCurve || [];
                break; // 🟢 Exit loop immediately once we have data
            } else {
                console.warn(`[BotService] ⚠️ Attempt ${i}: Python returned 0 candles. Retrying...`);
            }
        } catch (e) {
            console.warn(`[BotService] ⚠️ Attempt ${i} Connection Failed: ${e.message}`);
        }
    }

    // 4. Update Node.js DB with the DATA included
    const updateData = {
        userId,
        symbol: pythonConfig.symbol,
        timeframe: pythonConfig.timeframe,
        status: 'running',
        mode: pythonConfig.mode,
        capitalAllocation: pythonConfig.initialBalance,
        currentBalance: pythonConfig.initialBalance, 
        isCombo: pythonConfig.isCombo,
        strategies: strategiesPayload,
        comboConfig: pythonConfig.comboConfig,
        mlMode: pythonConfig.mlMode,
        startedAt: new Date(),
        stoppedAt: null,
        // 🟢 SAVE INITIAL DATA NOW
        candles: initialCandles,
        equityCurve: initialEquity
    };

    if (initialCandles.length === 0) {
        console.error("[BotService] ❌ WARNING: Saving bot with 0 candles. Charts will be empty.");
    }

    return await Bot.findOneAndUpdate(
        { botId }, 
        { 
            $set: updateData,
            $push: { logs: { timestamp: new Date(), message: `🚀 Bot Started: ${pythonConfig.symbol}`, type: 'status' } }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

// 🟢 2. STOP BOT (Includes Final Sync)
export async function stopTradingBot(userId) {
    if (!userId) throw new Error("Missing userId");

    // 1. Final Sync
    const finalState = await callPythonApi('/api/bot/status', 'GET', { userId });

    // 2. Stop Python
    try {
        await callPythonApi('/api/bot/stop', 'POST', { userId });
    } catch (err) {
        console.warn("⚠️ Python Stop Warning:", err.message);
    }

    // 3. Update DB
    const updateData = {
        status: 'stopped',
        stoppedAt: new Date(),
        $push: { 
            logs: { type: 'status', message: `🛑 Bot Stopped.`, timestamp: new Date() } 
        }
    };

    // Save final data so chart doesn't disappear
    if (finalState) {
        if (finalState.candles && finalState.candles.length > 0) updateData.candles = finalState.candles;
        if (finalState.equityCurve && finalState.equityCurve.length > 0) updateData.equityCurve = finalState.equityCurve;
        if (finalState.currentBalance !== undefined) updateData.currentBalance = finalState.currentBalance;
    }

    return await Bot.findOneAndUpdate({ userId }, updateData, { new: true });
}

export async function resetBotController(userId, config) {
    try {
        await callPythonApi('/api/bot/reset', 'POST', { userId, ...config });
    } catch (e) {
        console.warn("Python reset warning:", e.message);
    }

    return await Bot.findOneAndUpdate(
        { userId },
        {
            status: 'stopped',
            currentBalance: config.capitalAllocation || 1000,
            equityCurve: [],
            tradeHistory: [],
            activePositions: [],
            logs: [],
            candles: [] 
        },
        { new: true }
    );
}

export async function getBotStatus(userId) {
    const active = await Bot.findOne({ userId, status: 'running' });
    if (!active) return { status: 'stopped', isConfigured: false, logs: [] };

    const liveStatus = await callPythonApi('/api/bot/status', 'GET', { userId }); 
    
    if (liveStatus && liveStatus.status === 'running') {
        let needsSave = false;

        if (liveStatus.currentBalance !== undefined && liveStatus.currentBalance !== active.currentBalance) {
            active.currentBalance = liveStatus.currentBalance;
            needsSave = true;
        }
        // Only update candles if we got valid ones
        if (liveStatus.candles && liveStatus.candles.length > 0) {
            active.candles = liveStatus.candles;
            needsSave = true;
        }
        if (liveStatus.equityCurve && liveStatus.equityCurve.length > 0) {
            active.equityCurve = liveStatus.equityCurve;
            needsSave = true;
        }
        if (liveStatus.logs && liveStatus.logs.length > 0) {
            const existingLogs = new Set(active.logs.map(l => l.message));
            liveStatus.logs.forEach(msg => {
                if (!existingLogs.has(msg)) {
                    active.logs.push({ timestamp: new Date(), message: msg, type: 'info' });
                    needsSave = true;
                }
            });
        }
        if (needsSave) await active.save();

        return { 
            ...active.toObject(), 
            candles: liveStatus.candles || active.candles,
            equityCurve: liveStatus.equityCurve || active.equityCurve,
            logs: active.logs.reverse().slice(0, 50) 
        };
    } 
    return active.toObject();
}

export async function getBotLogs(userId, limit) {
    const active = await Bot.findOne({ userId, status: 'running' });
    if (!active) return [];
    const remoteLogs = await callPythonApi('/api/bot/logs', 'GET', { userId });
    return Array.isArray(remoteLogs) ? remoteLogs : active.logs;
}

export async function getWinnersList() {
    const rawWinners = await callPythonApi('/api/bot/winners', 'GET');
    if (!Array.isArray(rawWinners)) return [];
    return rawWinners.map(wrapper => {
        const rawConfig = wrapper.config || {};
        const roi = wrapper.roi || 0;
        return {
            ...rawConfig,
            botId: rawConfig.botId || wrapper.id,
            name: rawConfig.name || wrapper.name || "Unknown Strategy",
            roi: parseFloat(roi),
            metrics: { roi: parseFloat(roi) } 
        };
    }).sort((a, b) => b.roi - a.roi);
}
