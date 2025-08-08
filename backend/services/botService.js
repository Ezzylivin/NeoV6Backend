// File: backend/services/botService.js

import ExchangeService from './exchangeService.js';
import User from '../dbStructure/user.js';
import Bot from '../dbStructure/bot.js';           // ✅ Import your actual Bot model
import Log from './logService.js';
// ✅ Start the trading bot and store its config
export const startTradingBot = async (userId, symbol, amount, timeframes = ['5m']) => {
  try {
    const exchange = new ExchangeService(userId); // Connects using user’s API keys (if implemented)

    await bot.findOneAndUpdate(
      { userId },
      {
        isRunning: true,
        symbol,
        amount,
        timeframes,
        startedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    const message = `Bot started for ${symbol} with $${amount} on: ${timeframes.join(', ')}`;
    await logToDb(userId, message);
    console.log(`[BotService] ${message}`);

    // 🔁 TODO: Run bot logic loop here using cron/queue/worker
  } catch (err) {
    console.error(`[StartBot Error]: ${err.message}`);
    await logToDb(userId, `Failed to start bot: ${err.message}`);
    throw err;
  }
};

// ✅ Stop the trading bot by updating its status
export const stopTradingBot = async (userId) => {
  try {
    await bot.findOneAndUpdate(
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

// ✅ Get bot status for a user
export const getBotStatus = async (userId) => {
  try {
    const Bot = await bot.findOne({ userId });

    // Return either the bot config or a default "not running" object
    return Bot || {
      userId,
      isRunning: false,
      symbol: null,
      amount: 0,
      timeframes: [],
      startedAt: null,
    };
  } catch (err) {
    console.error(`[BotStatus Error]: ${err.message}`);
    throw err;
  }
};
