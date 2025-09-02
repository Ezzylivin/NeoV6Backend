// File: src/backend/utils/validateMarket.js
import ccxt from 'ccxt';

const US_EXCHANGES = ['binanceus', 'coinbasepro', 'kraken'];
const TOP_PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'LTC/USD'];

export const isValidMarket = async (exchangeId, symbol) => {
  if (!US_EXCHANGES.includes(exchangeId.toLowerCase())) return false;
  if (!TOP_PAIRS.includes(symbol)) return false;

  const ExchangeClass = ccxt[exchangeId];
  if (!ExchangeClass) return false;

  const exchange = new ExchangeClass({ enableRateLimit: true });
  await exchange.loadMarkets();
  
  const market = exchange.markets[symbol];
  return market && market.type === 'spot';
};
