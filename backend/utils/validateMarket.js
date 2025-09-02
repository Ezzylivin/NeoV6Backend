// src/backend/utils/validateMarket.js
import { fetchUSSpotMarkets } from './exchanges.js';

let cachedMarkets = null;

export async function isValidMarket(exchangeName, symbol) {
  // Cache markets for performance
  if (!cachedMarkets) cachedMarkets = await fetchUSSpotMarkets();

  const exchangeMarkets = cachedMarkets[exchangeName] || [];
  return exchangeMarkets.includes(symbol);
}
