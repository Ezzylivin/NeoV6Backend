// File: backend/services/botService.js

import ExchangeService from './exchangeService.js';
import User from '../dbStructure/user.js';
import Bot from '../dbStructure/bot.js';
import { logToDb } from './logService.js';

/**
 * Start a trading bot for a user with full configuration.
 * @param {string} userId - User ID
 * @param {string} symbol - Trading pair (e.g., BTC/USDT)
 * @param {number} amount - Initial balance
 * @param {string[]} timeframes - Array of timeframes
 * @param {string} strategy - Strategy name
 * @param {string} risk - Risk level
 */
export const startTradingBot = async (userId, symbol, amount, timeframes = ['5m'], strategy = 'default', risk = 'medium') => {
  try {
    const exchange = new ExchangeService(userId);

    // Upsert bot configuration
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

    const message = `Bot started | Symbol: ${symbol}, Balance: $${amount}, Timeframes: ${timeframes.join(', ')}, Strategy: ${strategy}, Risk: ${risk}`;
    await logToDb(userId, message);
    console.log(`[BotService] ${message}`);

    // TODO: Implement actual bot logic loop here (cron/job/worker)
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
