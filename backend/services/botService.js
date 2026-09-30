// File: backend/services/botService.js
// 🚀 UPGRADE: v11.9 - Engine shared-secret + full config mapping for new controls
import axios from "axios";
import https from 'https';
import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";

// Set ML_SERVER_URL in the environment (see .env.example). Falls back to a
// local dev endpoint — never a hardcoded production host in source.
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://localhost:8000";
// Verify TLS certs by default. Only disable via ML_TLS_INSECURE=true (e.g. a
// self-signed dev box) — never in production, where JWTs and orders traverse this link.
const httpsAgent = new https.Agent({ rejectUnauthorized: process.env.ML_TLS_INSECURE !== 'true' });
// Shared secret so the engine can reject anyone but this backend once its
// ENGINE_API_KEY is set (see SECURITY.md). Harmless while unset on either side.
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

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
            timeout: 15000,
            headers: ENGINE_API_KEY ? { "X-Internal-Key": ENGINE_API_KEY } : {},
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

// Number helper that respects an explicit 0 (unlike `Number(x) || default`).
const numOr = (v, d) => (v === undefined || v === null || v === "" ? d : Number(v));

export async function startTradingBot(userId, incomingData = {}) {
    console.log(`\n🚨 START BOT REQUEST: ${userId}`);
    if (!userId) throw new Error("Missing userId");

    const config = incomingData.config || incomingData;

    // 1. Core Logic Fallbacks
    const symbol = (config.symbol || "BTC-USD").replace('/', '-').toUpperCase();
    const timeframe = config.timeframe || "1h";
    const capital = Number(config.capitalAllocation) || 1000;

    // Explicitly extract enable_shorting from incoming payload
    const enableShorting = config.enable_shorting === true || config.enable_shorting === 'true';

    const strategiesPayload = await resolveStrategies(userId, config);
    const botId = `${userId}_${symbol}_${timeframe}`;

   const rawConfig = {
        botId,
        mode: config.mode || 'paper',
        symbol,
        timeframe,
        enable_shorting: enableShorting,
        initialBalance: capital,
        mlMode: config.mlMode || "off",
        mlModel: config.mlModel || "stacking",
        mlThreshold: config.mlThreshold || 0.55,
        mlThresholdLong: config.mlThresholdLong || 0.55,
        mlThresholdShort: config.mlThresholdShort || 0.55,

        // 🚀 UPGRADE: Map new regime parameters for the Python Engine
        minAdx: Number(config.minAdx) || 20.0,
        minVolRatio: Number(config.minVolRatio) || 0.8,
        minWeightedSignal: Number(config.minWeightedSignal) || 0.3,

        // 🚀 v11.9: forward the newer engine controls (defaults match the engine,
        // so behavior is unchanged unless the client sends them).
        minEntryScore: numOr(config.minEntryScore, 65),
        requireTrendAlignment: config.requireTrendAlignment !== false, // default true
        resumeOpenPositions: config.resumeOpenPositions !== false,     // default true
        maxRiskPerTradePct: numOr(config.maxRiskPerTradePct, 100),
        minAtrPct: numOr(config.minAtrPct, 0.1),
        maxAtrPct: numOr(config.maxAtrPct, 5.0),
        minVotesRequired: numOr(config.minVotesRequired, 1),
        candleRefreshSecs: numOr(config.candleRefreshSecs, 20),

        isCombo: strategiesPayload.length > 1,
        strategies: strategiesPayload,
        comboConfig: config.comboConfig || { combinationRule: 'AND' },
        riskManagementMode: config.riskManagementMode || 'static',
        riskPercentage: Number(config.riskPercentage) || 1.0,
        maxDailyLoss: Number(config.maxDailyLoss) || 5,
        maxDrawdown: Number(config.maxDrawdown) || 10,
        maxTradesPerDay: Number(config.maxTradesPerDay) || 20,
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
        enable_shorting: enableShorting,
        status: 'running',
        mode: rawConfig.mode,
        capitalAllocation: capital,
        currentBalance: capital,
        isCombo: rawConfig.isCombo,
        strategies: strategiesPayload,
        comboConfig: rawConfig.comboConfig,
        mlMode: rawConfig.mlMode,
        mlModel: rawConfig.mlModel,
        mlThresholdLong: rawConfig.mlThresholdLong,
        mlThresholdShort: rawConfig.mlThresholdShort,

        // 🚀 UPGRADE: Persist the new runtime regime limits in MongoDB
        minAdx: rawConfig.minAdx,
        minVolRatio: rawConfig.minVolRatio,
        minWeightedSignal: rawConfig.minWeightedSignal,

        // 🚀 v11.9: persist the newer controls too
        minEntryScore: rawConfig.minEntryScore,
        requireTrendAlignment: rawConfig.requireTrendAlignment,
        resumeOpenPositions: rawConfig.resumeOpenPositions,
        maxRiskPerTradePct: rawConfig.maxRiskPerTradePct,
        minAtrPct: rawConfig.minAtrPct,
        maxAtrPct: rawConfig.maxAtrPct,
        maxTradesPerDay: rawConfig.maxTradesPerDay,

        riskManagementMode: rawConfig.riskManagementMode,
        riskPercentage: rawConfig.riskPercentage,
        maxDailyLoss: rawConfig.maxDailyLoss,
        maxDrawdown: rawConfig.maxDrawdown,
        maxPyramiding: rawConfig.maxPyramiding,
        slippageTolerance: config.slippageTolerance || 0.5,
        params: rawConfig.params,
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
    // .lean() returns a plain object (no Mongoose hydration) — much cheaper for
    // these large bot docs, and we only read fields / spread them below.
    let dbBot = await Bot.findOne({ userId }).lean();

    // 🛑 1. ZOMBIE PREVENTION CHECK
    // If the DB explicitly says 'stopped', trust it over Python.
    // This prevents the "Self-Heal" logic below from resurrecting a bot you just killed.
    if (dbBot && dbBot.status === 'stopped') {
        return {
            ...dbBot,
            status: 'stopped',
            logs: dbBot.logs || [],
            tradeHistory: dbBot.tradeHistory || dbBot.trade_history || [] // 🚀 FIX: Load historical data even when stopped
        };
    }

    // 2. Self-Heal Logic (Only if DB thinks it's running or doesn't exist)
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
            ).lean();
        }

        return {
            ...dbBot,
            status: 'running',
            candles: liveStatus.candles || dbBot.candles || [],
            equityCurve: liveStatus.equityCurve || dbBot.equityCurve || [],
            logs: liveStatus.logs || dbBot.logs || [],
            currentBalance: liveStatus.currentBalance || dbBot.currentBalance,

            // 🚀 FIX: Route the engine's active ledger payloads straight to your React UI context
            tradeHistory: liveStatus.tradeHistory || liveStatus.trade_history || dbBot.tradeHistory || dbBot.trade_history || [],
            tradeMarkers: liveStatus.tradeMarkers || liveStatus.trade_markers || dbBot.tradeMarkers || dbBot.trade_markers || []
        };
    }

    if ((!liveStatus || liveStatus.status === 'stopped') && (!dbBot || dbBot.status === 'stopped')) {
        return {
            status: 'stopped',
            isConfigured: !!dbBot,
            logs: dbBot?.logs || [],
            tradeHistory: dbBot?.tradeHistory || dbBot?.trade_history || [] // 🚀 FIX: Fallback ledger population
        };
    }

    // Absolute fallback
    if (dbBot) {
        return {
            ...dbBot,
            tradeHistory: dbBot.tradeHistory || dbBot.trade_history || []
        };
    }

    return { status: 'stopped', logs: [], tradeHistory: [] };
}
export async function getBotLogs(userId, limit = 100) {
    // Only pull the logs field, as a plain object, and cap to the requested limit
    // instead of hydrating the whole (potentially huge) bot document.
    const active = await Bot.findOne({ userId, status: 'running' }).select('logs').lean();
    if (!active || !active.logs) return [];
    return active.logs.slice(-limit);
}

export async function closeActivePosition(userId, symbol) {
    if (!userId) throw new Error("Missing userId");

    // Only need timeframe + active positions here — select just those, as a plain object.
    const botRecord = await Bot.findOne({ userId }).select('timeframe activePositions').lean();

    const timeframe = botRecord?.timeframe || "1h";
    const botId = `${userId}_${symbol}_${timeframe}`;

    console.log(`🎯 Service: Requesting Manual Exit for ${botId}`);

    // 1. Tell the Python Engine to close the trade
    const pythonResponse = await callPythonApi('/api/bot/close-position', 'POST', {
        userId,
        symbol,
        botId
    });

    // 🚀 UPGRADE: Capture the active position details before wiping them out
    const activePos = botRecord?.activePositions?.[0];
    let tradeUpdate = {};

    if (activePos) {
        // Build the receipt to feed your frontend Audit History component structure
        const historicalReceipt = {
            symbol: symbol,
            side: activePos.side || 'long',
            entryPrice: activePos.entryPrice || activePos.entry || 0,
            exitPrice: activePos.currentPrice || activePos.entryPrice || 0, // uses latest tracked asset price
            size: activePos.size || 0,
            entryTime: activePos.entryTime || new Date(),
            exitTime: new Date(),
            pnl: activePos.unrealizedPnL || 0,
            exitReason: 'manual'
        };

        // Inject the trade history push array into our atomic MongoDB query
        tradeUpdate = { $push: { tradeHistory: historicalReceipt, logs: { timestamp: new Date(), message: `🚩 Manual Exit Executed: ${symbol}`, type: 'action' } } };
    } else {
        // Fallback if no position array metrics were established yet
        tradeUpdate = { $push: { logs: { timestamp: new Date(), message: `🚩 Manual Exit Executed: ${symbol} (No live position data)`, type: 'action' } } };
    }

    // 2. Local DB Cleanup (Now including the tradeHistory record update)
    const updatedBot = await Bot.findOneAndUpdate(
        { userId },
        {
            $set: { activePositions: [], currentPosition: null },
            ...tradeUpdate
        },
        { new: true }
    );

    return {
        success: !!pythonResponse,
        bot: updatedBot
    };
}

export async function getWinnersList() {
    const rawWinners = await callPythonApi('/api/bot/winners', 'GET');
    if (!Array.isArray(rawWinners)) return [];
    return rawWinners.map(w => ({ ...w.config, botId: w.config.botId || w.id, roi: parseFloat(w.roi || 0) }));
}
