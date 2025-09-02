// src/backend/services/marketDataService.js
import ccxt from 'ccxt';

const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes cache

// Simple in-memory cache: key -> { ts, value }
const cache = new Map();

/**
 * Build a cache key for OHLCV requests
 */
function cacheKey(exchangeId, symbol, timeframe, limit) {
  return `${exchangeId}::${symbol}::${timeframe}::${limit}`;
}

/**
 * Try multiple symbol formats that exchanges commonly use.
 * e.g. "BTCUSDT" -> ["BTC/USDT", "BTC-USDT", "BTC/USD", "BTC-USD"]
 */
function generateSymbolCandidates(symbol) {
  const s = symbol.replace(/[-_/]/g, '').toUpperCase();
  // Common endings
  const candidates = [];
  // If given like BTCUSDT or BTCUSD
  const m = s.match(/^([A-Z]{3,5})(USDT|USD|BTC|ETH)$/);
  if (m) {
    const base = m[1];
    const quote = m[2];
    candidates.push(`${base}/${quote}`);
    candidates.push(`${base}-${quote}`);
    candidates.push(`${base}${quote}`); // raw
  } else {
    // fallback split
    if (symbol.includes('/') || symbol.includes('-')) {
      const replaced = symbol.replace('-', '/').toUpperCase();
      candidates.push(replaced);
      candidates.push(replaced.replace('/', '-'));
    } else {
      // brute force split for common pairs
      ['USDT', 'USD', 'BTC', 'ETH'].forEach(q => {
        if (s.endsWith(q)) {
          const base = s.slice(0, s.length - q.length);
          candidates.push(`${base}/${q}`);
          candidates.push(`${base}-${q}`);
          candidates.push(`${base}${q}`);
        }
      });
    }
  }
  // Unique
  return Array.from(new Set(candidates));
}

/**
 * Fetch OHLCV from ccxt; enforces spot markets only by using fetchOHLCV.
 * Returns array of [timestamp(ms), open, high, low, close, volume]
 *
 * exchangeId: ccxt id (e.g. 'coinbasepro', 'binanceus', 'kraken')
 * symbol: something like 'BTCUSDT' or 'BTC/USD'
 * timeframe: ccxt timeframe string '1m','5m','1h', ...
 * limit: number of candles
 */
export async function fetchOHLCV(exchangeId = 'coinbasepro', symbol = 'BTC/USD', timeframe = '1h', limit = 500) {
  const key = cacheKey(exchangeId, symbol, timeframe, limit);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  // try to create ccxt instance for exchange
  if (!ccxt[exchangeId]) {
    throw new Error(`Exchange ${exchangeId} not available in ccxt`);
  }

  const ex = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 15000 });

  // ccxt sometimes needs loadMarkets first
  try {
    await ex.loadMarkets();
  } catch (err) {
    // ignore; some exchanges auto-load in fetchOHLCV
  }

  // Try a few symbol formats
  const candidates = generateSymbolCandidates(symbol);

  let lastErr = null;
  for (const candidate of candidates) {
    try {
      // Some exchanges expect "BTC/USD", some "BTC-USD", fetchOHLCV uses unified symbol
      const ohlcv = await ex.fetchOHLCV(candidate, timeframe, undefined, limit);
      // Save to cache (convert timestamp to ms if necessary - ccxt returns ms)
      cache.set(key, { ts: Date.now(), value: ohlcv });
      return ohlcv;
    } catch (err) {
      lastErr = err;
      // continue to try other candidate formats
    }
  }

  // If none worked, throw last error
  const friendly = lastErr ? lastErr.message || lastErr.toString() : 'unknown';
  throw new Error(`Failed to fetch OHLCV from ${exchangeId} for ${symbol}: ${friendly}`);
}
