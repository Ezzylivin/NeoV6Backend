// File: backend/services/botService.js
// 🚀 UPGRADE: v11.1 - Unified Service (Smart Inputs + Data Guarantee)
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
        const queryParams = new URLSearchParams();
        if (method === 'GET') {
            if (data.userId) queryParams.append("userId", data.userId);
            if (data.botId) queryParams.append("botId", data.botId);
            if (queryParams.toString()) url += `?${queryParams.toString()}`;
        }

        console.log(`[🔍 API CALL] ${method} -> ${url}`); 

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
            console.error(`[❌ API ERROR] ${endpoint}: ${error.message}`);
        }
        return null; 
    }
}

// --- Strategy Resolver Helper ---
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

// ---------------------------------------------------------
// 🚀 EXPORTED FUNCTIONS
// ---------------------------------------------------------

export async function startTradingBot(userId, incomingData = {}) {
    console.log("\n\n🚨🚨🚨 START TRADING BOT CALLED 🚨🚨🚨"); 
    console.log(`👤 User: ${userId}`);

    if (!userId) throw new Error("Missing userId");

    // 🟢 1. SMART UNWRAPPING
    // Handles both { config: {...} } and { ... } formats
    const config = incomingData.config || incomingData;

    // 🟢 2. VALIDATION
    if (!config.symbol || !config.timeframe) {
        console.error("❌ Invalid Config Received:", JSON.stringify(config));
        throw new Error("Missing required fields: symbol, timeframe, or capitalAllocation.");
    }

    // 3. Resolve Strategies
    const strategiesPayload = await resolveStrategies(userId, config);
    if (strategiesPayload.length === 0) throw new Error("No valid strategies found.");

    const cleanSymbol = (config.symbol || "BTC-USD").replace('/', '-');
    const botId = `${userId}_${cleanSymbol}_${config.timeframe || "1h"}`;

    // 4. Prepare Clean Config
    const rawConfig = {
        botId,
        mode: config.mode || 'paper', 
        symbol: config.symbol, 
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

    // 🟢 5. WRAP FOR PYTHON (Correct Structure)
    const pythonPayload = {
        userId: userId,
        config: rawConfig 
    };

    console.log("👉 1. Sending START command to Python...");
    await callPythonApi('/api/bot/start', 'POST', pythonPayload);

    // 🟢 6. DATA GUARANTEE LOOP (The Fix for Empty Candles)
    // We wait up to 10 seconds for Python to fetch data before saving to DB
    let initialCandles = [];
    let initialEquity = [];
    
    console.log("⏳ Waiting for Python to fetch market data...");
    
    for (let i = 1; i <= 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
        
        try {
            const liveState = await callPythonApi('/api/bot/status', 'GET', { userId });
            
            if (liveState && liveState.candles && liveState.candles.length > 0) {
                console.log(`   ✅ Data Acquired: ${liveState.candles.length} candles.`);
                initialCandles = liveState.candles;
                initialEquity = liveState.equityCurve || [];
                break; 
            } else {
                console.log(`   ...attempt ${i}/10: No candles yet.`);
            }
        } catch (e) {
            console.error(`   ❌ LOOP ERROR: ${e.message}`);
        }
    }

    if (initialCandles.length === 0) {
        console.warn("⚠️ Warning: Python timed out fetching data. Bot starting with empty state.");
    }

    // 7. Update Node.js DB
    const updateData = {
        userId,
        symbol: rawConfig.symbol,
        timeframe: rawConfig.timeframe,
        status: 'running',
        mode: rawConfig.mode,
        capitalAllocation: rawConfig.initialBalance,
        currentBalance: rawConfig.initialBalance, 
        isCombo: rawConfig.isCombo,
        strategies: strategiesPayload,
        comboConfig: rawConfig.comboConfig,
        mlMode: rawConfig.mlMode,
        startedAt: new Date(),
        stoppedAt: null,
        candles: initialCandles,
        equityCurve: initialEquity
    };

    const result = await Bot.findOneAndUpdate(
        { botId }, 
        { 
            $set: updateData,
            $push: { logs: { timestamp: new Date(), message: `🚀 Bot Started: ${rawConfig.symbol}`, type: 'status' } }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    console.log("✅✅✅ DB SAVE COMPLETE ✅✅✅\n\n");
    return result;
}

// 🟢 STOP BOT
export async function stopTradingBot(userId) {
    if (!userId) throw new Error("Missing userId");

    const finalState = await callPythonApi('/api/bot/status', 'GET', { userId });

    try {
        await callPythonApi('/api/bot/stop', 'POST', { userId });
    } catch (err) {
        console.warn("⚠️ Python Stop Warning:", err.message);
    }

    const updateData = {
        status: 'stopped',
        stoppedAt: new Date(),
        $push: { 
            logs: { type: 'status', message: `🛑 Bot Stopped.`, timestamp: new Date() } 
        }
    };

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
    } catch (e) { console.warn("Python reset warning:", e.message); }

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
