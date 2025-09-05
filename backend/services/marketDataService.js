import ccxt from 'ccxt';

const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes cache
const cache = new Map();

// ✅ Updated cache key to include startDate and endDate
function cacheKey(exchangeId, symbol, timeframe, limit, startDate, endDate) {
  return `${exchangeId}::${symbol}::${timeframe}::${limit}::${startDate ? startDate.toISOString() : 'null'}::${endDate ? endDate.toISOString() : 'null'}`;
}

function generateSymbolCandidates(symbol) {
  const s = symbol.replace(/[-_/]/g, '').toUpperCase();
  const candidates = [];

  const m = s.match(/^([A-Z]{3,5})(USDT|USD|BTC|ETH)$/);
  if (m) {
    const base = m[1], quote = m[2];
    candidates.push(`${base}/${quote}`, `${base}-${quote}`, `${base}${quote}`);
  } else {
    if (symbol.includes('/') || symbol.includes('-')) {
      const replaced = symbol.replace('-', '/').toUpperCase();
      candidates.push(replaced, replaced.replace('/', '-'));
    } else {
      ['USDT','USD','BTC','ETH'].forEach(q => {
        if (s.endsWith(q)) {
          const base = s.slice(0, s.length - q.length);
          candidates.push(`${base}/${q}`, `${base}-${q}`, `${base}${q}`);
        }
      });
    }
  }

  // Add the original symbol to candidates just in case
  if (!candidates.includes(symbol.toUpperCase()) && !candidates.includes(symbol.replace('-', '/').toUpperCase())) {
     candidates.unshift(symbol.toUpperCase());
  }

  return Array.from(new Set(candidates));
}

// ✅ Updated function signature to accept startDate and endDate
export async function fetchOHLCV(exchangeId = 'coinbasepro', symbol = 'BTC/USD', timeframe = '1h', limit = 500, startDate = null, endDate = null) {
  const key = cacheKey(exchangeId, symbol, timeframe, limit, startDate, endDate);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  if (!ccxt[exchangeId]) throw new Error(`Exchange ${exchangeId} not available in ccxt`);

  const ex = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 15000 });
  try {
    await ex.loadMarkets();
  } catch (e) {
    // ✅ Log error for market loading
    console.warn(`[CCXT] Failed to load markets for ${exchangeId}: ${e.message}`);
  }

  const candidates = generateSymbolCandidates(symbol);
  let lastErr = null;
  let ohlcv = []; // Initialize outside the loop

  const sinceTimestamp = startDate ? startDate.getTime() : undefined; // Convert Date to timestamp for 'since'
  const untilTimestamp = endDate ? endDate.getTime() : undefined; // Used for post-fetching filtering

  for (const candidate of candidates) {
    try {
      // CCXT's fetchOHLCV takes (symbol, timeframe, since, limit, params)
      // We pass 'since' and 'limit'. The actual number of candles returned might be less than limit if 'since' is too recent.
      // Some exchanges might also interpret `limit` differently when `since` is provided.
      ohlcv = await ex.fetchOHLCV(candidate, timeframe, sinceTimestamp, limit);

      // ✅ Filter results by endDate if provided
      if (untilTimestamp) {
        ohlcv = ohlcv.filter(candle => candle[0] <= untilTimestamp);
      }

      if (ohlcv.length > 0) {
        cache.set(key, { ts: Date.now(), value: ohlcv });
        return ohlcv;
      }
    } catch (err) {
      lastErr = err;
      // console.warn(`[CCXT] Attempt with ${candidate} on ${exchangeId} failed: ${err.message}`); // For debugging symbol candidates
    }
  }

  const friendly = lastErr ? lastErr.message || lastErr.toString() : 'unknown';
  throw new Error(`Failed to fetch OHLCV from ${exchangeId} for ${symbol} with given parameters (candidates: ${candidates.join(', ')}, error: ${friendly})`);
}

// ✅ Removed the redundant default export, sticking to named export as used by backtestService
// export default { fetchOHLCV };
