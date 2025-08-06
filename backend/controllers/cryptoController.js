// File: backend/controllers/cryptoController.js
import ccxt from 'ccxt';
import User from '../dbStructure/user.js';

/**
 * Get supported trading pairs based on the user's stored exchange and API keys
 */
export const getSupportedSymbols = async (req, res) => {
  const userId = req.user.id; // Requires `protect` middleware to populate req.user

  try {
    const user = await User.findById(userId);
    if (!user || user.exchangeKeys.length === 0) {
      return res.status(400).json({ message: 'No exchange keys configured' });
    }

    const { exchange, apiKey, apiSecret } = user.exchangeKeys[0]; // You can loop or filter for a specific one

    const ExchangeClass = ccxt[exchange];
    if (!ExchangeClass) {
      return res.status(400).json({ message: `Exchange ${exchange} not supported` });
    }

    const exchangeInstance = new ExchangeClass({
      apiKey,
      secret: apiSecret,
    });

    const markets = await exchangeInstance.loadMarkets();
    const symbols = Object.keys(markets);

    res.json({ exchange, supported: symbols });
  } catch (error) {
    console.error('Error fetching exchange symbols:', error);
    res.status(500).json({ message: 'Unable to fetch symbols' });
  }
};
