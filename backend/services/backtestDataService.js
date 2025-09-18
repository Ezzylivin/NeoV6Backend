import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js';

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini'];
const CANDLE_LIMIT = 400;
const CACHE_DURATION = 10 * 60 * 1000;

async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
  try {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    if (candles && candles.length > 0) {
      return candles;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// UPGRADED: Now with persistent caching and exchange symbol validation
export async function getBacktestOptionsData() {
  const cacheKey = 'backtestOptions';
  const cachedEntry = await Cache.findOne({ key: cacheKey });
  if (cachedEntry) {
    return cachedEntry.data;
  }

  const cryptoApiUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1';
  try {
    const response = await axios.get(cryptoApiUrl);
    const topCryptos = response.data.map(coin => coin.symbol.toUpperCase() + '/USD');
    
    const validSymbols = new Set();
    const supportedTimeframes = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);
    const tempExchanges = US_EXCHANGES.map(id => new ccxt[id]());
    
    // Check if each crypto is supported on at least one US exchange
    for (const symbol of topCryptos) {
      for (const exchange of tempExchanges) {
        if (exchange.markets && exchange.markets[symbol]) {
          validSymbols.add(symbol);
          break;
        }
      }
    }

    const newOptions = {
      symbols: Array.from(validSymbols).sort(),
      timeframes: Array.from(supportedTimeframes),
    };

    const expiresAt = new Date(Date.now() + CACHE_DURATION);
    await Cache.create({ key: cacheKey, data: newOptions, expiresAt });
    return newOptions;
  } catch (err) {
    console.error("❌ Failed to fetch backtest options:", err);
    return {
      symbols: ['BTC/USD', 'ETH/USD', 'ADA/USD'],
      timeframes: ['1d', '4h', '1h', '15m'],
    };
  }
}

// UPGRADED: A single, robust fetch function for OHLCV data
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
  const cacheKey = `candles::${symbol}::${timeframe}`;
  const cachedEntry = await Cache.findOne({ key: cacheKey });
  if (cachedEntry) {
    return cachedEntry.data;
  }
  
  const exchanges = ['coinbase', 'kraken', 'gemini'];
  
  for (const exchangeId of exchanges) {
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000 });
    const symbolFormats = [
        symbol,
        symbol.replace('/', '-')
    ];

    for (const format of symbolFormats) {
      const candles = await fetchCandlesWithRetry(exchange, format, timeframe);
      if (candles) {
        const result = { candles, exchange: exchangeId };
        const expiresAt = new Date(Date.now() + CACHE_DURATION);
        await Cache.create({ key: cacheKey, data: result, expiresAt });
        return result;
      }
    }
  }

  throw new Error(`Failed to fetch candle data for ${symbol} from all available US exchanges.`);
}
