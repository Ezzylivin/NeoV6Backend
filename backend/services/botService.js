import ExchangeService from './exchangeService.js';
import User from '../dbStructure/user.js';
import Bot from '../dbStructure/bot.js';
import { logToDb } from './logService.js';

// Start the trading bot and store its config
export const startTradingBot = async (userId, symbol, amount, timeframes = ['5m'], strategy = 'default', risk = 'medium') => {
  try {
    const exchange = new ExchangeService(userId);

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

    const message = `Bot started for ${symbol} with $${amount}, Strategy: ${strategy}, Risk: ${risk}, Timeframes: ${timeframes.join(', ')}`;
    await logToDb(userId, message);
    console.log(`[BotService] ${message}`);
  } catch (err) {
    console.error(`[StartBot Error]: ${err.message}`);
    await logToDb(userId, `Failed to start bot: ${err.message}`);
    throw err;
  }
};

// Stop the bot
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

// Get bot status
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
