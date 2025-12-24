// File: src/backend/services/botService.js
// 🚀 UPGRADE: v5.2 - File-System Based Winners & Robust ID Generation

import axios from 'axios';
import https from 'https';
import fs from 'fs/promises'; // NEW: For reading results
import path from 'path';      // NEW: For path resolution
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

// Use Env Var for flexibility, default to Localhost for Render internal comms
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://127.0.0.1:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 📂 NEW: Define path to optimizer results
const OPTIMIZER_DIR = path.resolve('./ML/data/optimizer_results');

async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        let url = `${ML_SERVER_URL}${endpoint}`;
        // Pass botId in query for GET requests
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

// 🚀 UPDATED: Read from File System instead of Python API
export async function getWinnersList() {
    try {
        // 1. Check if directory exists
        try {
            await fs.access(OPTIMIZER_DIR);
        } catch (e) {
            console.warn(`⚠️ Optimizer directory not found: ${OPTIMIZER_DIR}`);
            return []; 
        }

        // 2. Read all filenames
        const files = await fs.readdir(OPTIMIZER_DIR);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        // 3. Parse files in parallel
        const winners = await Promise.all(
            jsonFiles.map(async (filename) => {
                try {
                    const filePath = path.join(OPTIMIZER_DIR, filename);
                    const fileContent = await fs.readFile(filePath, 'utf-8');
                    const data = JSON.parse(fileContent);

                    // 🛡️ CRITICAL FIX: Ensure botId exists for Frontend Keys
                    // If JSON lacks botId, use filename (minus .json)
                    const safeBotId = data.botId || filename.replace('.json', '');
                    
                    // 🛡️ Fallback for ROI calculation if missing
                    let safeRoi = data.roi;
                    if (safeRoi === undefined && data.metrics) {
                         const capital = data.config?.initial_capital || 1000;
                         safeRoi = data.metrics.net_profit / capital; 
                    }

                    return {
                        ...data,
                        botId: safeBotId,      
                        filename: filename,    
                        roi: safeRoi || 0,
                        symbol: data.symbol || 'UNKNOWN',
                        metrics: data.metrics || {},
                        config: data.config || {}
                    };
                } catch (err) {
                    console.error(`❌ Error parsing ${filename}:`, err.message);
                    return null;
                }
            })
        );

        // 4. Return valid, sorted results
        return winners
            .filter(w => w !== null)
            .sort((a, b) => b.roi - a.roi);

    } catch (e) {
        console.error("🔥 Error in getWinnersList:", e);
        return [];
    }
}

export async function startTradingBot(userId, config = {}) {
    if (!userId) throw new Error("Missing userId");

    const { symbol, timeframe, capitalAllocation, comboConfig, mlMode, mlModel, mlThreshold, params, mode, riskManagementMode, riskPercentage, maxPyramiding, slippageBps } = config;

    // 1. Resolve Strategies
    const strategiesPayload = await resolveStrategies(userId, config);
    if (strategiesPayload.length === 0) throw new Error("No valid strategies found.");

    // Generate Unique Bot ID
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
        riskPercentage: pythonConfig.riskPercentage,
        maxPyramiding: pythonConfig.maxPyramiding,
        startedAt: new Date()
    };

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

// 🚀 NEW: RESET FUNCTION
export async function resetTradingBot(userId, config) {
    const { symbol, timeframe, capitalAllocation } = config;
    const cleanSymbol = (symbol || "BTC-USD").replace('/', '-');
    const botId = `${userId}_${cleanSymbol}_${timeframe || "1h"}`;

    // 1. Tell Python to wipe the slate
    await callPythonApi('/api/bot/reset', 'POST', { botId, capitalAllocation });

    // 2. Wipe Node.js Database Record to match
    await Bot.deleteOne({ botId });

    return { status: "reset", message: "Bot history wiped." };
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

            if (liveStatus.positions && liveStatus.positions.length > 0) {
                const totalSize = liveStatus.positions.reduce((s, p) => s + p.qty, 0);
                // Simple Weighted Average for display
                const weightedEntry = liveStatus.positions.reduce(
                    (s, p) => s + p.entry * p.qty, 0
                ) / totalSize;

                bot.currentPosition = {
                    entryPrice: weightedEntry,
                    size: totalSize,
                    side: liveStatus.positions[0].side, // Assume all same side for now
                    entryTime: liveStatus.positions[0].time,
                    pnl: 0 // Python calculates PnL on equity
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
            positions: liveStatus.positions || [],
            candles: liveStatus.candles || [] // Pass candles to frontend
        };
    } 
    else if (bot && bot.status === 'running') {
        // Python says stopped, Node says running -> Sync to stopped
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
