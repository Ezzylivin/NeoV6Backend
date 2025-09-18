// File: backend/services/backtestDataService.js
import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js'; // Import the new cache model

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini']; // Using the list from the better implementation
const CANDLE_LIMIT = 400; // Using the more generous limit
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // Cache for 1 minute

async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
  console.log(`[CandleService] Attempting to fetch ${symbol} on ${exchange.id}`);
  try {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    if (candles && candles.length > 0) {
      console.log(`[CandleService] Successfully fetched ${candles.length} candles for ${symbol}`);
      return candles;
    }
    console.warn(`[CandleService] Exchange returned empty data for ${symbol}.`);
    return null;
  } catch (e) {
    console.error(`[CandleService] Error fetching ${symbol} on ${exchange.id}:`, e.message);
    return null;
  }
}

// UPGRADED: Now with persistent caching for options to prevent rate-limiting issues
export async function getBacktestOptionsData() {
  const cacheKey = 'backtestOptions';
  const cachedEntry = await Cache.findOne({ key: cacheKey });
  
  if (cachedEntry) {
    console.log("Serving backtest options from persistent cache.");
    return cachedEntry.data;
  }

  const cryptoApiUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1';
  try {
    const response = await axios.get(cryptoApiUrl);
    const top10Cryptos = response.data.map(coin => ({ 
        id: coin.id,
        symbol: coin.symbol.toUpperCase() + '/USD'
    }));
    const symbols = top10Cryptos.map(crypto => crypto.symbol);
    const timeframes = ['1m','5m','15m','30m','1h','4h','1d'];
    const newOptions = { symbols, timeframes };

    const expiresAt = new Date(Date.now() + CACHE_DURATION);
    await Cache.create({ key: cacheKey, data: newOptions, expiresAt });

    return newOptions;
  } catch (err) {
    console.error("❌ Failed to fetch backtest options:", err);
    return {
      symbols: ['BTC/USD', 'ETH/USD', 'ADA/USD', 'XRP/USD', 'DOGE/USD'],
      timeframes: ['1m','5m','15m','30m','1h','4h','1d'],
    };
  }
}

// UPGRADED: A single, robust fetch function for OHLCV data
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
  const key = `${symbol}::${timeframe}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const exchanges = ['coinbase', 'kraken', 'gemini'];
  
  for (const exchangeId of exchanges) {
    console.log(`[CandleService] Trying US exchange: ${exchangeId}`);
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000 });

    const symbolFormats = [
        symbol.includes('/') ? symbol : `${symbol.slice(0, -3)}/${symbol.slice(-3)}`,
        symbol.replace('/', '-')
    ];

    for (const format of symbolFormats) {
        const candles = await fetchCandlesWithRetry(exchange, format, timeframe);
        if (candles) {
            const result = { candles };
            cache.set(key, { ts: Date.now(), value: result });
            return result;
        }
    }
  }

  throw new Error(`Failed to fetch candle data for ${symbol} from all available US exchanges.`);
}
