// File: backend/controllers/cryptoController.js
import ccxt from 'ccxt';

/**
 * Get supported trading pairs (symbols) from Binance or other exchange
 */
export const getSupportedSymbols = async (req, res) => {
  try {
    const exchange = new ccxt.binance(); // You can make this dynamic per-user later
    const markets = await exchange.loadMarkets();

    const symbols = Object.keys(markets);

    res.json({ supported: symbols });
  } catch (error) {
    console.error('Error fetching symbols:', error);
    res.status(500).json({ message: 'Failed to fetch symbols' });
  }
};
