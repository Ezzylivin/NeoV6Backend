// File: backend/services/botService.js
import ExchangeService from './exchangeService.js';
import User from '../dbStructure/user.js;
import BotStatus from '../dbStructure/botStatus.js';
import Log from '../dbStructure/log.js';

// Utility function to log messages to MongoDB
const logToDb = async (userId, message) => {
  try {
    await Log.create({ userId, message });
  } catch (err) {
    console.error(`[Log Error]: ${err.message}`);
  }
};




export const startTradingBot = async (userId, symbol, amount, timeframes = ['5m']) => {
  try {
    const exchange = new ExchangeService(userId); // uses user’s API keys if available

    await Bot.findOneAndUpdate(
      { userId },
      { isRunning: true, symbol, amount, timeframes, startedAt: new Date() },
      { upsert: true, new: true }
    );

    const message = `Bot started for ${symbol} with ${amount} units on timeframes: ${timeframes.join(', ')}`;
    await logToDb(userId, message);
    console.log(message);

    // Add your bot logic loop here...
    // For real bots, use worker threads, Bull queues, or PM2-managed services.

  } catch (err) {
    console.error(`[StartBot Error]: ${err.message}`);
    await logToDb(userId, `Failed to start bot: ${err.message}`);
    throw err;
  }
};

export const stopTradingBot = async (userId) => {
  try {
    await Bot.findOneAndUpdate(
      { userId },
      { isRunning: false },
      { new: true }
    );

    const message = `Bot stopped by user.`;
    await logToDb(userId, message);
    console.log(message);
  } catch (err) {
    console.error(`[StopBot Error]: ${err.message}`);
    await logToDb(userId, `Failed to stop bot: ${err.message}`);
    throw err;
  }
};

export const Bot = async (userId) => {
  try {
    const status = await Bot.findOne({ userId });
    return status || { isRunning: false };
  } catch (err) {
    console.error(`[BotStatus Error]: ${err.message}`);
    throw err;
  }
};

// Optional Express handler wrapper
export const startBotHandler = async (req, res) => {
  const { symbol, amount, timeframes } = req.body;
  if (!symbol || !amount) {
    return res.status(400).json({ message: 'symbol and amount are required.' });
  }

  try {
    await startTradingBot(req.user.id, symbol, amount, timeframes);
    res.json({ status: 'Bot started' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const stopBotHandler = async (req, res) => {
  try {
    await stopTradingBot(req.user.id);
    res.json({ status: 'Bot stopped' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getBotStatusHandler = async (req, res) => {
  try {
    const status = await getBotStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
