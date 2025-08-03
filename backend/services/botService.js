
// backend/services/botService.js
const ExchangeService = require('./exchangeService');
const { decrypt } = require('./cryptoService');
const { logToUser } = require('../websocketManager');
const User = require('../models/userModel');

const activeBots = new Map();

const startTradingBot = async (userId, symbol = 'BTC/USDT', amount = 0.001, timeframes = ['5m']) => {
  if (activeBots.has(userId)) {
    return logToUser(userId, 'Bot is already running.');
  }

  logToUser(userId, `[Bot] Initializing in standard mode for ${symbol} with amount ${amount} on timeframes: ${timeframes.join(', ')}`);

  try {
    const user = await User.findById(userId);
    if (!user || !user.exchangeApiSecret || !user.exchangeApiKey) throw new Error('API keys are not set for this user.');

    const apiKey = decrypt(user.exchangeApiKey);
    const apiSecret = decrypt(user.exchangeApiSecret);
    const exchange = new ExchangeService(apiKey, apiSecret);

    const tradingLoop = setInterval(async () => {
      if (!activeBots.has(userId)) return clearInterval(tradingLoop);

      for (const tf of timeframes) {
        try {
          const data = await exchange.fetchOHLCV(symbol, tf, 100);
          const lastClose = data[data.length - 1][4];
          // TODO: Replace with your strategy logic
          logToUser(userId, `[Standard ${tf}] Last Close: ${lastClose}`);
        } catch (err) {
          logToUser(userId, `[Standard ${tf}] Error: ${err.message}`);
        }
      }
    }, 60000);

    activeBots.set(userId, { instance: tradingLoop, mode: 'standard' });
  } catch (err) {
    logToUser(userId, `[Bot] CRITICAL ERROR: ${err.message}`);
    if (activeBots.has(userId)) activeBots.delete(userId);
  }
};

const stopTradingBot = (userId) => {
  if (!activeBots.has(userId)) return logToUser(userId, 'Bot is not running.');

  const botInfo = activeBots.get(userId);
  clearInterval(botInfo.instance);
  activeBots.delete(userId);
  logToUser(userId, 'Bot has been stopped.');
};

module.exports = { startTradingBot, stopTradingBot };
