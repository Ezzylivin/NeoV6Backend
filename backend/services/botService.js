// File: backend/services/botService.js
// 🚀 UPGRADE: v11.2 - Self-Healing Status (Fixes "Stopped" Race Condition)
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

        // console.log(`[🔍 API CALL] ${method} -> ${url}`); // Commented out to reduce spam

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
        // Silent fail for status checks to prevent log flooding
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
    console.log(`\n🚨 START BOT REQUEST: ${userId}`);
    if (!userId) throw new Error("Missing userId");

    // 1. Unwrapping
    const config = incomingData.config || incomingData;

    // 2. Validation
    if (!config.symbol || !config.timeframe) {
        throw new Error("Missing required fields: symbol, timeframe, or capitalAllocation.");
    }

    const strategiesPayload = await resolveStrategies(userId, config);
    const cleanSymbol = (config.symbol || "BTC-USD").replace('/', '-');
    const botId = `${userId}_${cleanSymbol}_${config.timeframe || "1h"}`;

    // 3. Prepare Config
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

    // 4. Send to Python
    const pythonPayload = { userId: userId, config: rawConfig };
    await callPythonApi('/api/bot/start', 'POST', pythonPayload);

    // 🟢 5. QUICK-CHECK LOOP
    // Wait for Python to transition from 'initializing' to 'running' with data
    let initialCandles = [];
    let initialEquity = [];
    
    console.log("⏳ Waiting for Python data sync...");
    
    for (let i = 1; i <= 8; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1s wait
        const liveState = await callPythonApi('/api/bot/status', 'GET', { userId });
        
        // Accept 'running' state OR just presence of candles
        if (liveState && liveState.candles && liveState.candles.length > 0) {
            initialCandles = liveState.candles;
            initialEquity = liveState.equityCurve || [];
            console.log(`   ✅ Data Acquired: ${initialCandles.length} candles.`);
            break; 
        }
    }

    // 6. Save to DB
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

    return await Bot.findOneAndUpdate(
        { botId }, 
        { 
            $set: updateData,
            $push: { logs: { timestamp: new Date(), message: `🚀 Bot Started: ${rawConfig.symbol}`, type: 'status' } }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
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

// 🟢 🚀 UPGRADED STATUS CHECK (Self-Healing)
export async function getBotStatus(userId) {
    // 1. Ask Python FIRST (The Truth Source)
    const liveStatus = await callPythonApi('/api/bot/status', 'GET', { userId }); 

    let dbBot = await Bot.findOne({ userId, status: 'running' });

    // 🛑 Scenario A: Python says "Running", but DB says "Stopped" (or doesn't exist)
    // -> We Trust Python and Revive the DB entry
    if (liveStatus && (liveStatus.status === 'running' || liveStatus.status === 'initializing') && !dbBot) {
        console.log(`[Self-Heal] Python is running but DB is empty for ${userId}. Resyncing...`);
        
        // We need to find the latest "stopped" bot to reactivate, or create new
        dbBot = await Bot.findOneAndUpdate(
            { userId }, 
            { 
                status: 'running', 
                candles: liveStatus.candles || [],
                currentBalance: liveStatus.currentBalance
            },
            { new: true, upsert: true } // Create if missing
        );
    }

    // 🛑 Scenario B: Both say Stopped
    if ((!liveStatus || liveStatus.status === 'stopped') && (!dbBot)) {
        return { status: 'stopped', isConfigured: false, logs: [] };
    }

    // 🟢 Scenario C: Normal Operation (Sync Python -> DB)
    if (liveStatus && dbBot) {
        let needsSave = false;
        
        // Sync Balance
        if (liveStatus.currentBalance !== undefined && liveStatus.currentBalance !== dbBot.currentBalance) {
            dbBot.currentBalance = liveStatus.currentBalance;
            needsSave = true;
        }
        
        // Sync Candles (Only if we have new ones)
        if (liveStatus.candles && liveStatus.candles.length > 0) {
            // Simple check: if lengths differ, update
            if (!dbBot.candles || liveStatus.candles.length !== dbBot.candles.length) {
                dbBot.candles = liveStatus.candles;
                needsSave = true;
            }
        }
        
        // Sync Logs
        if (liveStatus.logs && liveStatus.logs.length > 0) {
            const existingLogs = new Set(dbBot.logs.map(l => l.message));
            liveStatus.logs.forEach(msg => {
                if (!existingLogs.has(msg)) {
                    dbBot.logs.push({ timestamp: new Date(), message: msg, type: 'info' });
                    needsSave = true;
                }
            });
        }

        if (needsSave) await dbBot.save();

        return { 
            ...dbBot.toObject(), 
            // Prefer live data for UI responsiveness
            candles: liveStatus.candles || dbBot.candles, 
            equityCurve: liveStatus.equityCurve || dbBot.equityCurve,
            logs: dbBot.logs.reverse().slice(0, 50) 
        };
    }

    // Fallback: Return whatever is in DB if Python is down
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
