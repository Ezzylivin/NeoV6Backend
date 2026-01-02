// File: src/backend/services/botService.js

import axios from 'axios';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

// 🟢 CONFIG: Your Python VPS Engine
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000"; 
const httpsAgent = { rejectUnauthorized: false }; // simplified for axios

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

        console.log(`[BotService] ${method} -> ${url}`);

        const config = { 
            method, 
            url, 
            data: method !== 'GET' ? data : undefined, 
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

// ---------------------------------------------------------
// 🚀 EXPORTED FUNCTIONS
// ---------------------------------------------------------

/**
 * Fetches "Winners" from Python and formats them for the Frontend
 */
export async function getWinnersList() {
    // 1. Get Raw List from Python
    // Python returns: [{ "id": "...", "name": "...", "config": { ...json_file_content... } }]
    const rawWinners = await callPythonApi('/api/bot/winners', 'GET');
    
    if (!Array.isArray(rawWinners)) return [];

    // 2. Transform & Calculate ROI (Restore original logic)
    const formattedWinners = rawWinners.map(wrapper => {
        // Unwrap the actual data
        const data = wrapper.config || {}; 
        
        // Calculate ROI if missing (logic from your old file-system service)
        let safeRoi = data.roi;
        if (safeRoi === undefined && data.metrics) {
             const capital = data.config?.initial_capital || 1000;
             safeRoi = capital > 0 ? (data.metrics.net_profit / capital) : 0;
        }

        // Return flattened object for Frontend
        return {
            ...data, // Spread actual backtest stats (metrics, equityCurve, etc.)
            
            // Ensure IDs and Names exist
            botId: data.botId || wrapper.id, 
            name: data.name || wrapper.name, // Fixes "undefined" in dropdown
            filename: wrapper.name,
            
            // Ensure ROI exists
            roi: safeRoi || 0,
            
            // Defaults
            symbol: data.symbol || 'UNKNOWN',
            metrics: data.metrics || {}
        };
    });

    // 3. Sort by ROI (Highest First)
    return formattedWinners.sort((a, b) => b.roi - a.roi);
}

// ... (Keep the rest of your file: startTradingBot, stopTradingBot, etc. unchanged) ...
// Below is the rest of the file for safety/reference:

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

export async function startTradingBot(userId, config = {}) {
    if (!userId) throw new Error("Missing userId");

    const strategiesPayload = await resolveStrategies(userId, config);
    if (strategiesPayload.length === 0) throw new Error("No valid strategies found.");

    const cleanSymbol = (config.symbol || "BTC-USD").replace('/', '-');
    const botId = `${userId}_${cleanSymbol}_${config.timeframe || "1h"}`;

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

    const response = await callPythonApi('/api/bot/start', 'POST', pythonConfig);
    if (!response) throw new Error("Failed to start bot via Python Engine.");

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
    const active = await Bot.findOne({ userId, status: 'running' }).select('botId');
    if (!active) return { status: 'stopped', isConfigured: false, logs: [] };

    const liveStatus = await callPythonApi('/api/bot/status', 'GET', { botId: active.botId });
    let bot = await Bot.findOne({ botId: active.botId });

    if (liveStatus && liveStatus.status === 'running') {
        if (bot) {
            bot.currentBalance = liveStatus.currentBalance;
            await bot.save();
        }
        const logs = await callPythonApi('/api/bot/logs', 'GET', { botId: active.botId });
        return { 
            ...bot.toObject(), 
            logs: logs || bot.logs, 
            trades: liveStatus.trades || [],
            positions: liveStatus.positions || [],
            candles: liveStatus.candles || [] 
        };
    } 
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

export async function resetBotController(userId, config) {
    // Basic implementation to match your controller calls if needed
    // The previous file had 'resetTradingBot' but controller called something else? 
    // Just ensuring exports align.
}
