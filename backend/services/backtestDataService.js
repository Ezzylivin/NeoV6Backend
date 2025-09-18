// File: backend/services/backtestDataService.js
import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js'; 

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini'];
const CANDLE_LIMIT = 400;
const CACHE_DURATION = 10 * 60 * 1000; // 10 min
const CACHE_TTL_MS = 60 * 1000; // in-memory cache TTL

const cache = new Map();

// --- Normalize symbol to US-style (XXX/USD) ---
function normalizeToUSD(symbol) {
  if (!symbol) return 'BTC/USD';
  let upper = symbol.toUpperCase();

  // Already in XXX/USD
  if (upper.includes('/USD')) return upper;

  // Binance style BTCUSDT -> BTC/USD
  if (upper.endsWith('USDT')) {
    return upper.replace('USDT', '/USD');
  }

  // Gemini/Coinbase style BTC-USD -> BTC/USD
  if (upper.includes('-USD')) {
    return upper.replace('-USD', '/USD');
  }

  // If just BTC or ETH etc → append /USD
  if (!upper.includes('/')) {
    return `${upper}/USD`;
  }

  return upper;
}

// --- Fetch candles safely ---
async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
  console.log(`[CandleService] Attempting to fetch ${symbol} on ${exchange.id}`);
  try {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    if (candles && candles.length > 0) {
      console.log(`[CandleService] ✅ ${exchange.id} returned ${candles.length} candles for ${symbol}`);
      return candles;
    }
    console.warn(`[CandleService] ⚠️ ${exchange.id} returned empty data for ${symbol}`);
    return null;
  } catch (e) {
    console.error(`[CandleService] ❌ Error fetching ${symbol} on ${exchange.id}:`, e.message);
    return null;
  }
}

// --- Backtest Options (symbols & timeframes) ---
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
        symbol: `${coin.symbol.toUpperCase()}/USD`  // force USD pairs
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

// --- Multi-exchange safe fetch ---
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
  const normalized = normalizeToUSD(symbol);
  const key = `${normalized}::${timeframe}`;

  // in-memory cache
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  for (const exchangeId of US_EXCHANGES) {
    console.log(`[CandleService] Trying US exchange: ${exchangeId}`);
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000 });

    // Try both `BTC/USD` and `BTC-USD` just in case
    const symbolFormats = [
      normalized,
      normalized.replace('/', '-') // fallback
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

  throw new Error(`Failed to fetch candle data for ${normalized} from all available US exchanges.`);
}
