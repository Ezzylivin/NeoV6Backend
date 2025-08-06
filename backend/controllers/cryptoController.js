// File: backend/controllers/cryptoController.js
import ccxt from 'ccxt';
import User from '../models/userModel.js';

/**
 * Get supported symbols for all exchanges linked to the user
 */
export const getSupportedSymbols = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user || user.exchangeKeys.length === 0) {
      return res.status(400).json({ message: 'No exchange keys configured' });
    }

    const result = [];

    for (const { exchange, apiKey, apiSecret } of user.exchangeKeys) {
      const ExchangeClass = ccxt[exchange];

      if (!ExchangeClass) {
        result.push({
          exchange,
          error: `Exchange '${exchange}' not supported`
        });
        continue;
      }

      try {
        const exchangeInstance = new ExchangeClass({ apiKey, secret: apiSecret });
        const markets = await exchangeInstance.loadMarkets();
        const symbols = Object.keys(markets);

        result.push({ exchange, supported: symbols });
      } catch (err) {
        result.push({
          exchange,
          error: `Failed to fetch symbols: ${err.message}`
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error loading user exchanges:', error);
    res.status(500).json({ message: 'Unable to fetch exchange symbols' });
  }
};
