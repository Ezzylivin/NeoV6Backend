// src/backend/utils/exchanges.js
import ccxt from 'ccxt';

// List of US-based spot exchanges
const EXCHANGES = {
  coinbase: new ccxt.coinbase({ enableRateLimit: true }),
  kraken: new ccxt.kraken({ enableRateLimit: true }),
  gemini: new ccxt.gemini({ enableRateLimit: true }),
  binanceus: new ccxt.binanceus({ enableRateLimit: true }),
};

// Top trading pairs to include
const TOP_PAIRS = ['BTC/USDT','ETH/USDT','BNB/USDT','SOL/USDT'];

export async function fetchUSSpotMarkets() {
  const spotMarkets = {};

  for (const [name, exchange] of Object.entries(EXCHANGES)) {
    try {
      const markets = await exchange.fetchMarkets();
      // Only keep spot markets and top pairs
      spotMarkets[name] = markets
        .filter(m => m.type === 'spot' && TOP_PAIRS.includes(m.symbol))
        .map(m => m.symbol);
    } catch (err) {
      console.warn(`Skipping ${name} due to error: ${err.message}`);
      spotMarkets[name] = [];
    }
  }

  return spotMarkets;
}
