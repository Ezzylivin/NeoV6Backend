// File: src/backend/services/botService.js
// 🚀 UPGRADE: Real-time Log Merging

import axios from 'axios';
import https from 'https';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://74.208.28.77:8000"; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function callPythonApi(endpoint, method = 'GET', data = {}) {
    try {
        const url = `${ML_SERVER_URL}${endpoint}`;
        const config = { 
            method, 
            url, 
            data,
            httpsAgent: httpsAgent,
            timeout: 5000 // 5s timeout
        };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        // console.warn(`[Python API Warning] ${endpoint}:`, error.message);
        return null; // Return null on failure so we can handle it gracefully
    }
}

export async function getWinnersList() {
    const list = await callPythonApi('/api/bot/winners', 'GET');
    return list || [];
}

export async function startTradingBot(userId, config = {}) {
    if (!userId) throw new Error("Missing userId");
    
    // ... (Keep your existing startTradingBot logic here) ...
    // (I am omitting the setup logic to save space, paste your previous logic here)
    // ...

    const pythonConfig = {
        symbol: config.symbol || "BTC-USD",
        timeframe: config.timeframe || "1h",
        capitalAllocation: config.capitalAllocation || 1000,
        mlMode: config.mlMode || "off",
        mlModel: config.mlModel || "",
        mlThreshold: config.mlThreshold || 0.5,
        isCombo: !!(config.comboConfig),
        strategies: config.strategies || [],
        params: config.params || {}
    };

    // Call Start
    await callPythonApi('/api/bot/start', 'POST', pythonConfig);

    let bot = await Bot.findOne({ userId });
    if (!bot) bot = new Bot({ userId });

    bot.status = 'running';
    bot.symbol = pythonConfig.symbol;
    bot.startedAt = new Date();
    bot.logs.push({ timestamp: new Date(), message: "Bot Started via Web UI", type: 'status' });
    
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

// 🚀 FIX: LIVE STATUS MERGING
export async function getBotStatus(userId) {
    const bot = await Bot.findOne({ userId }).lean();
    if (!bot) return { status: 'stopped', isConfigured: false };

    if (bot.status === 'running') {
        // Try to get live data
        const liveStatus = await callPythonApi('/api/bot/status', 'GET');

        if (liveStatus) {
            return {
                ...bot,
                // OVERWRITE Mongo data with Live data
                currentBalance: liveStatus.currentBalance || bot.currentBalance,
                trades: liveStatus.trades || [],
                // MERGE Logs: If Python returns logs, use them. Otherwise use DB.
                logs: (liveStatus.logs && liveStatus.logs.length > 0) ? liveStatus.logs : bot.logs,
                isConfigured: true
            };
        } else {
            // Python didn't respond (maybe busy), return DB state but keep running
            return { ...bot, isConfigured: true, warning: "Syncing..." };
        }
    }

    return { ...bot, isConfigured: true };
}

export async function getBotLogs(userId) {
    const bot = await Bot.findOne({ userId });
    if (!bot) return [];
    return bot.logs;
}
