// File: backend/services/botService.js
// UPGRADED: This service now provides a complete, stateful, in-memory trading bot engine
// that is fully synchronized with the new bot schema.

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
    stopTradingBot(bot.userId); // Ensure the interval is cleared
    return;
  }

  try {
    // 1. Fetch the strategy details
    const strategy = await Strategy.findById(bot.strategyId).lean();
    if (!strategy) throw new Error(`Strategy with ID ${bot.strategyId} not found.`);

    // 2. Fetch the latest market data
    // We fetch enough candles for the strategy's indicators to calculate correctly.
    const { candles } = await fetchOHLCVMultiSafe(bot.symbol, bot.timeframe);
    if (!candles || candles.length === 0) {
        console.warn(`[Bot Iteration] No market data for ${bot.symbol}`);
        return;
    }

    // 3. Get the strategy logic function
    const strategyFunction = getStrategy(strategy.params.strategyType);

    // 4. Run the strategy to get the latest signals
    const trades = strategyFunction(candles, strategy.params);
    const lastSignal = trades.length > 0 ? trades[trades.length - 1].signal : null;
    const currentPrice = candles[candles.length - 1][4]; // Get the latest close price

    // 5. Manage the bot's position based on the signal
    if (lastSignal === 'buy' && !bot.currentPosition) {
        // --- ENTER LONG POSITION ---
        const positionSize = bot.currentBalance / currentPrice; // Example: use full balance
        bot.currentPosition = {
            entryPrice: currentPrice,
            size: positionSize,
            side: 'long',
            entryTime: new Date(),
        };
        bot.addLog('buy', `Entering long position for ${positionSize.toFixed(4)} ${bot.symbol} at $${currentPrice}.`);
    } else if (lastSignal === 'sell' && bot.currentPosition?.side === 'long') {
        // --- EXIT LONG POSITION ---
        const entry = bot.currentPosition;
        const profit = (currentPrice - entry.entryPrice) * entry.size;
        
        bot.currentBalance += profit;
        bot.performanceMetrics.totalProfit += profit;
        bot.performanceMetrics.totalTrades += 1;
        
        // Update win rate
        const wins = trade.profit > 0 ? 1 : 0;
        const total = bot.performanceMetrics.totalTrades;
        bot.performanceMetrics.winRate = (( (bot.performanceMetrics.winRate / 100 * (total - 1)) + wins) / total) * 100;
        
        bot.addLog('sell', `Exiting long position. Profit: $${profit.toFixed(2)}`);
        bot.currentPosition = null; // Clear the position
    }

    await bot.save();

  } catch (err) {
    console.error(`[Bot Iteration Error][${bot.userId}]`, err);
    bot.status = 'error';
    bot.addLog('error', `An error occurred: ${err.message}`);
    await bot.save();
    stopTradingBot(bot.userId); // Stop the bot on critical error
  }
}

/**
 * Creates and starts a trading bot for a user.
 */
export async function startTradingBot(userId, config = {}) {
  if (!userId) throw new Error("Missing userId");
  const { strategyId, symbol, timeframe, capitalAllocation } = config;

  // Stop any existing bot for this user
  if (activeBots.has(userId.toString())) {
    await stopTradingBot(userId);
  }

  // Find or create the bot configuration
  let bot = await Bot.findOne({ userId });
  if (!bot) {
    bot = new Bot({ userId });
  }

  bot.strategyId = strategyId;
  bot.symbol = symbol;
  bot.timeframe = timeframe;
  bot.capitalAllocation = capitalAllocation;
  bot.currentBalance = capitalAllocation; // Reset balance on start
  bot.performanceMetrics = { totalProfit: 0, totalTrades: 0, winRate: 0 };
  bot.currentPosition = null;
  bot.logs = [];
  bot.status = 'running';
  bot.startedAt = new Date();
  bot.stoppedAt = null;
  
  bot.addLog('status', `Bot started with ${symbol} on ${timeframe} timeframe.`);
  await bot.save();

  // Start the trading loop
  const interval = setInterval(() => {
    botIteration(bot._id).catch(e => console.error("[Bot Iteration Unhandled]", e));
  }, 60 * 1000); // Run every 60 seconds (adjust as needed)

  activeBots.set(userId.toString(), interval);

  return bot;
}

/**
 * Stops a trading bot for a user.
 */
export async function stopTradingBot(userId) {
  const bot = await Bot.findOne({ userId });
  if (bot) {
    bot.status = 'stopped';
    bot.stoppedAt = new Date();
    bot.addLog('status', 'Bot stopped.');
    await bot.save();
  }

  const userIdStr = userId.toString();
  if (activeBots.has(userIdStr)) {
    clearInterval(activeBots.get(userIdStr));
    activeBots.delete(userIdStr);
  }
  
  return bot;
}

/**
 * Gets the current status and essential details of a user's bot.
 */
export async function getBotStatus(userId) {
  const bot = await Bot.findOne({ userId }).lean();
  if (!bot) {
      // Return a default "not configured" state
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
