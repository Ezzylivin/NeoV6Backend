// File: services/botService.js
// FINAL VERSION: This file is now complete and includes all necessary functions and logic for both single and combo bots.

import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// In-memory store for active bot intervals, keyed by the bot's database ID
const activeBots = new Map();

// Helper to apply the combination logic (re-used from backtesting engine)
function applyCombinationRule(signals, rule) {
  if (rule === 'AND') {
    if (signals.length > 0 && signals.every(s => s === 'buy')) return 'buy';
    if (signals.length > 0 && signals.every(s => s === 'sell')) return 'sell';
  } else if (rule === 'OR') {
    if (signals.some(s => s === 'buy')) return 'buy';
    if (signals.some(s => s === 'sell')) return 'sell';
  }
  return 'hold';
}

/**
 * The core logic loop for a single trading bot. This is the "brain" of the live bot.
 */
async function botIteration(botId) {
  const bot = await Bot.findById(botId);
  if (!bot || bot.status !== 'running') {
    if (activeBots.has(botId.toString())) {
        clearInterval(activeBots.get(botId.toString()));
        activeBots.delete(botId.toString());
    }
    return;
  }

  try {
    const { candles, exchange } = await fetchOHLCVMultiSafe(bot.symbol, bot.timeframe);
    if (!candles || candles.length === 0) {
        console.warn(`[Bot Iteration] No market data for ${bot.symbol} on ${exchange}.`);
        return;
    }

    let lastSignal = 'hold';
    const currentPrice = candles[candles.length - 1][4];

    if (bot.isCombo) {
        // --- Combo Strategy Logic ---
        const dbStrategies = await Strategy.find({ userId: bot.userId, code: { $in: bot.comboConfig.strategyCodes } }).lean();
        if (dbStrategies.length !== bot.comboConfig.strategyCodes.length) throw new Error("One or more combo strategies not found.");

        const currentSignals = dbStrategies.map(dbStrategy => {
            const strategyFunction = getStrategy(dbStrategy.params.strategyType);
            const trades = strategyFunction(candles, dbStrategy.params);
            return trades.length > 0 ? trades[trades.length - 1].signal : 'hold';
        });
        
        lastSignal = applyCombinationRule(currentSignals, bot.comboConfig.combinationRule);
        bot.addLog('info', `Checked combo signals on ${exchange}. Final signal: ${lastSignal}.`);
    } else {
        // --- Single Strategy Logic ---
        const strategy = await Strategy.findById(bot.strategyId).lean();
        if (!strategy) throw new Error(`Strategy with ID ${bot.strategyId} not found.`);
        
        const strategyFunction = getStrategy(strategy.params.strategyType);
        const trades = strategyFunction(candles, strategy.params);
        lastSignal = trades.length > 0 ? trades[trades.length - 1].signal : 'hold';
        bot.addLog('info', `Checked for signals on ${exchange}. Last signal: ${lastSignal}.`);
    }

    // --- Position Management (works for both single and combo) ---
    if (lastSignal === 'buy' && !bot.currentPosition) {
        const positionSize = bot.currentBalance / currentPrice;
        bot.currentPosition = { entryPrice: currentPrice, size: positionSize, side: 'long', entryTime: new Date() };
        bot.addLog('buy', `Entering long position for ${positionSize.toFixed(4)} ${bot.symbol} at $${currentPrice} on ${exchange}.`);
    } else if (lastSignal === 'sell' && bot.currentPosition?.side === 'long') {
        const entry = bot.currentPosition;
        const profit = (currentPrice - entry.entryPrice) * entry.size;
        
        bot.currentBalance += profit;
        bot.performanceMetrics.totalProfit += profit;
        bot.performanceMetrics.totalTrades += 1;
        
        const wins = profit > 0 ? 1 : 0;
        const total = bot.performanceMetrics.totalTrades;
        bot.performanceMetrics.winRate = (((bot.performanceMetrics.winRate / 100 * (total - 1)) + wins) / total) * 100;
        
        bot.addLog('sell', `Exiting long position on ${exchange}. Profit: $${profit.toFixed(2)}`);
        bot.currentPosition = null;
    }

    await bot.save();
  } catch (err) {
    console.error(`[Bot Iteration Error][${bot.userId}]`, err);
    bot.status = 'error';
    bot.addLog('error', `An error occurred: ${err.message}`);
    await bot.save();
    stopTradingBot(bot.userId);
  }
}

/**
 * Creates and starts a trading bot for a user. Handles both single and combo strategies.
 */
export async function startTradingBot(userId, config = {}) {
  if (!userId) throw new Error("Missing userId");
  const { strategyId, symbol, timeframe, capitalAllocation, comboConfig } = config;

  await stopTradingBot(userId); // Stop any existing bot for this user first

  let bot = await Bot.findOne({ userId });
  if (!bot) {
    bot = new Bot({ userId });
  }

  // Configure the bot based on whether it's a single or combo strategy
  if (comboConfig && comboConfig.strategyCodes?.length > 0) {
      bot.isCombo = true;
      bot.comboConfig = comboConfig;
      bot.strategyId = null; // Ensure single strategy ID is cleared
  } else {
      bot.isCombo = false;
      bot.strategyId = strategyId;
      bot.comboConfig = null; // Ensure combo config is cleared
  }

  bot.symbol = symbol;
  bot.timeframe = timeframe;
  bot.capitalAllocation = capitalAllocation;
  bot.currentBalance = capitalAllocation;
  bot.performanceMetrics = { totalProfit: 0, totalTrades: 0, winRate: 0 };
  bot.currentPosition = null;
  bot.logs = [];
  bot.status = 'running';
  bot.startedAt = new Date();
  bot.stoppedAt = null;
  
  bot.addLog('status', `Bot started with ${symbol} on ${timeframe} timeframe.`);
  await bot.save();

  const interval = setInterval(() => {
    botIteration(bot._id).catch(e => console.error("[Bot Iteration Unhandled]", e));
  }, 60 * 1000);

  activeBots.set(bot._id.toString(), interval);

  return bot;
}

/**
 * Stops a trading bot for a user.
 */
export async function stopTradingBot(userId) {
  const bot = await Bot.findOne({ userId });
  if (!bot) return null;

  const botIdStr = bot._id.toString();
  if (activeBots.has(botIdStr)) {
    clearInterval(activeBots.get(botIdStr));
    activeBots.delete(botIdStr);
  }
  
  if (bot.status === 'running') {
    bot.status = 'stopped';
    bot.stoppedAt = new Date();
    bot.addLog('status', 'Bot stopped.');
    await bot.save();
  }
  
  return bot;
}

/**
 * Gets the current status and essential details of a user's bot.
 */
export async function getBotStatus(userId) {
  const bot = await Bot.findOne({ userId }).lean();
  if (!bot) {
      return { status: 'stopped', isConfigured: false };
  }
  return { ...bot, isConfigured: true };
}

/**
 * Gets the most recent log entries for a user's bot.
 */
export async function getBotLogs(userId, limit = 50) {
    const bot = await Bot.findOne({ userId }, { logs: { $slice: limit } }).lean();
    return bot ? bot.logs : [];
}

