// File: backend/services/botService.js
import ExchangeService from './exchangeService.js';
import Bot from '../dbStructure/bot.js';
import { logToDb } from './logService.js';

export const startTradingBot = async ({
  userId,
  symbol,
  amount = 10000,
  timeframes = ['5m'],
  strategy = 'default',
  risk = 'medium'
}) => {
  if (!userId || !symbol) throw new Error('userId and symbol are required');

  try {
    const exchange = new ExchangeService(userId);

    const botData = {
      isRunning: true,
      userId,
      symbol,
      amount,
      timeframes,
      strategy,
      risk,
      startedAt: new Date()
    };

    await Bot.findOneAndUpdate({ userId }, botData, { upsert: true, new: true });

    const message = `[BotService] Bot started for ${symbol} with $${amount} on ${timeframes.join(', ')} | Strategy: ${strategy} | Risk: ${risk}`;
    console.log(message);
    await logToDb(userId, message);

    // 🔁 TODO: Add bot execution loop (cron/worker)
    return botData;
  } catch (err) {
    console.error(`[StartBot Error] ${err.message}`);
    await logToDb(userId, `Failed to start bot: ${err.message}`);
    throw err;
  }
};

export const stopTradingBot = async (userId) => {
  if (!userId) throw new Error('userId is required');

  try {
    await Bot.findOneAndUpdate({ userId }, { isRunning: false }, { new: true });
    const message = `[BotService] Bot stopped by user ${userId}`;
    console.log(message);
    await logToDb(userId, message);
  } catch (err) {
    console.error(`[StopBot Error] ${err.message}`);
    await logToDb(userId, `Failed to stop bot: ${err.message}`);
    throw err;
  }
};

export const getBotStatus = async (userId) => {
  if (!userId) throw new Error('userId is required');

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
      startedAt: null
    };
  } catch (err) {
    console.error(`[BotStatus Error] ${err.message}`);
    throw err;
  }
};
