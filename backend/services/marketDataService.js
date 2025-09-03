import ccxt from 'ccxt';

const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes cache
const cache = new Map();

function cacheKey(exchangeId, symbol, timeframe, limit) {
  return `${exchangeId}::${symbol}::${timeframe}::${limit}`;
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

  return Array.from(new Set(candidates));
}

export async function fetchOHLCV(exchangeId = 'coinbasepro', symbol = 'BTC/USD', timeframe = '1h', limit = 500) {
  const key = cacheKey(exchangeId, symbol, timeframe, limit);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  if (!ccxt[exchangeId]) throw new Error(`Exchange ${exchangeId} not available in ccxt`);

  const ex = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 15000 });
  try { await ex.loadMarkets(); } catch {}

  const candidates = generateSymbolCandidates(symbol);
  let lastErr = null;

  for (const candidate of candidates) {
    try {
      const ohlcv = await ex.fetchOHLCV(candidate, timeframe, undefined, limit);
      cache.set(key, { ts: Date.now(), value: ohlcv });
      return ohlcv;
    } catch (err) {
      lastErr = err;
    }
  }

  const friendly = lastErr ? lastErr.message || lastErr.toString() : 'unknown';
  throw new Error(`Failed to fetch OHLCV from ${exchangeId} for ${symbol}: ${friendly}`);
}
