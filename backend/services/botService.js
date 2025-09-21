// File: backend/services/botService.js
// This service provides a complete, stateful, in-memory trading bot engine
// that is fully synchronized with the new bot schema and data service.

import Bot from "../dbStructure/bot.js";
import Strategy from "../dbStructure/strategy.js";
import { getStrategy } from "../strategies/strategyManager.js";
import { fetchOHLCVMultiSafe } from "./backtestDataService.js";

// In-memory store for active bot intervals, keyed by bot ID
const activeBots = new Map();

/**
 * The core logic loop for a single trading bot.
 * This function runs on a set interval for each active bot.
 */
async function botIteration(botId) {
  const bot = await Bot.findById(botId);

  // Stop if the bot has been disabled or deleted
  if (!bot || bot.status !== 'running') {
    if (activeBots.has(botId.toString())) {
        clearInterval(activeBots.get(botId.toString()));
        activeBots.delete(botId.toString());
    }
    return;
  }

  try {
    // 1. Fetch the strategy details
    const strategy = await Strategy.findById(bot.strategyId).lean();
    if (!strategy) throw new Error(`Strategy with ID ${bot.strategyId} not found.`);

    // 2. Fetch the latest market data
    const { candles, exchange } = await fetchOHLCVMultiSafe(bot.symbol, bot.timeframe);
    if (!candles || candles.length === 0) {
        console.warn(`[Bot Iteration] No market data for ${bot.symbol} on ${exchange}.`);
        return;
    }

    // 3. Get the strategy logic function
    const strategyFunction = getStrategy(strategy.params.strategyType);

    // 4. Run the strategy to get the latest signals
    const trades = strategyFunction(candles, strategy.params);
    const lastSignal = trades.length > 0 ? trades[trades.length - 1].signal : 'hold';
    const currentPrice = candles[candles.length - 1][4];

    bot.addLog('info', `Checked for signals on ${exchange}. Last signal: ${lastSignal}.`);

    // 5. Manage the bot's position based on the signal
    if (lastSignal === 'buy' && !bot.currentPosition) {
        // --- ENTER LONG POSITION ---
        const positionSize = bot.currentBalance / currentPrice;
        bot.currentPosition = {
            entryPrice: currentPrice,
            size: positionSize,
            side: 'long',
            entryTime: new Date(),
        };
        bot.addLog('buy', `Entering long position for ${positionSize.toFixed(4)} ${bot.symbol} at $${currentPrice} on ${exchange}.`);
    } else if (lastSignal === 'sell' && bot.currentPosition?.side === 'long') {
        // --- EXIT LONG POSITION ---
        const entry = bot.currentPosition;
        const profit = (currentPrice - entry.entryPrice) * entry.size;
        
        bot.currentBalance += profit;
        bot.performanceMetrics.totalProfit += profit;
        bot.performanceMetrics.totalTrades += 1;
        
        const wins = profit > 0 ? 1 : 0;
        const total = bot.performanceMetrics.totalTrades;
        bot.performanceMetrics.winRate = (( (bot.performanceMetrics.winRate / 100 * (total - 1)) + wins) / total) * 100;
        
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
 * Creates and starts a trading bot for a user.
 */
export async function startTradingBot(userId, config = {}) {
  if (!userId) throw new Error("Missing userId");
  const { strategyId, symbol, timeframe, capitalAllocation } = config;

  await stopTradingBot(userId); // Stop any existing bot for this user first

  let bot = await Bot.findOne({ userId });
  if (!bot) {
    bot = new Bot({ userId });
  }

  bot.strategyId = strategyId;
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

