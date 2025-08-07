// File: backend/controllers/cryptoController.js
import ccxt from 'ccxt';
import User from '../dbStructure/user.js';

export const getSupportedSymbols = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

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

      let exchangeInstance;

      try {
        // Try with credentials
        exchangeInstance = new ExchangeClass({
          apiKey,
          secret: apiSecret,
        });
        await exchangeInstance.checkRequiredCredentials();
      } catch (authError) {
        // Fallback to unauthenticated/public mode
        exchangeInstance = new ExchangeClass();
      }

      try {
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
    console.error('Error loading exchange symbols:', error);
    res.status(500).json({ message: 'Unable to fetch exchange symbols' });
  }
};
