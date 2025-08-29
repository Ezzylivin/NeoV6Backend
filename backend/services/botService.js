// File: backend/services/botService.js

import ExchangeService from './exchangeService.js';
import Bot from '../dbStructure/bot.js';
import { logToDb } from './logService.js';
import Price from './priceService.js'; // for getPrices()

/**
 * Start a trading bot for a user with full configuration.
 * Logs initial balance, current price, strategy, and risk.
 * @param {string} userId - User ID
 * @param {string} symbol - Trading pair (e.g., BTCUSDT)
 * @param {number} amount - Initial balance
 * @param {string[]} timeframes - Array of timeframes
 * @param {string} strategy - Strategy name
 * @param {string} risk - Risk level
 */
export const startTradingBot = async (
  userId,
  symbol,
  amount,
  timeframes = ['5m'],
  strategy = 'default',
  risk = 'medium'
) => {
  try {
    // Upsert bot configuration in DB
    await Bot.findOneAndUpdate(
      { userId },
      {
        isRunning: true,
        symbol,
        amount,
        timeframes,
        strategy,
        risk,
        startedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Get current price from REST price polling
    const currentPrice = Price.getPrices([symbol])[symbol] || 0;

    const message = `[Bot Started] Symbol: ${symbol} | Balance: $${amount} | Price: $${currentPrice} | Timeframes: ${timeframes.join(', ')} | Strategy: ${strategy} | Risk: ${risk}`;
    await logToDb(userId, message);
    console.log(`[BotService] ${message}`);

    // TODO: Add actual bot loop/logic here (cron/job/worker)
  } catch (err) {
    console.error(`[StartBot Error]: ${err.message}`);
    await logToDb(userId, `Failed to start bot: ${err.message}`);
    throw err;
  }
};

/**
 * Stop the trading bot for a user
 * @param {string} userId
 */
export const stopTradingBot = async (userId) => {
  try {
    await Bot.findOneAndUpdate(
      { userId },
      { isRunning: false },
      { new: true }
    );

    const message = `Bot stopped by user.`;
    await logToDb(userId, message);
    console.log(`[BotService] ${message}`);
  } catch (err) {
    console.error(`[StopBot Error]: ${err.message}`);
    await logToDb(userId, `Failed to stop bot: ${err.message}`);
    throw err;
  }
};

/**
 * Get the current bot status for a user
 * @param {string} userId
 * @returns {object} Bot configuration or default "not running"
 */
export const getBotStatus = async (userId) => {
  try {
    const bot = await Bot.findOne({ userId });

    return bot || {
      userId,
      isRunning: false,
      symbol: null,
      amount: 0,
      timeframes: [],
      strategy: null,
      risk: null,
      startedAt: null,
    };
  } catch (err) {
    console.error(`[BotStatus Error]: ${err.message}`);
    throw err;
  }
};
