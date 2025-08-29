export const startTradingBot = async (userId, symbol, amount, timeframes = ["5m"], strategy = "default", risk = "medium") => {
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

    const message = `Bot started for ${symbol} | Initial Balance: $${amount} | Strategy: ${strategy} | Risk: ${risk} | Timeframes: ${timeframes.join(", ")}`;
    await logToDb(userId, message);  // ✅ now logs initial balance, strategy, risk
    console.log(`[BotService] ${message}`);
  } catch (err) {
    console.error(`[StartBot Error]: ${err.message}`);
    await logToDb(userId, `Failed to start bot: ${err.message}`);
    throw err;
  }
};
