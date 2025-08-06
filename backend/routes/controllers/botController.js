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
