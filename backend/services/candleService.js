import ccxt from "ccxt";

const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const cache = new Map();
const MAX_CANDLES = 50000;

const TIMEFRAME_MS = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

// 🔑 Cache key
function cacheKey(exchangeId, symbol, timeframe, limit, startDate, endDate) {
  return `${exchangeId}::${symbol}::${timeframe}::${limit || ""}::${startDate || ""}::${endDate || ""}`;
}

// 🔑 Generate possible market symbols
function generateSymbolCandidates(symbol) {
  const s = symbol.replace(/[-_/]/g, "").toUpperCase();
  const candidates = [];

  const m = s.match(/^([A-Z]{3,5})(USDT|USD|BTC|ETH)$/);
  if (m) {
    const base = m[1], quote = m[2];
    candidates.push(`${base}/${quote}`, `${base}-${quote}`, `${base}${quote}`);
  } else {
    if (symbol.includes("/") || symbol.includes("-")) {
      const replaced = symbol.replace("-", "/").toUpperCase();
      candidates.push(replaced, replaced.replace("/", "-"));
    } else {
      ["USDT", "USD", "BTC", "ETH"].forEach((q) => {
        if (s.endsWith(q)) {
          const base = s.slice(0, s.length - q.length);
          candidates.push(`${base}/${q}`, `${base}-${q}`, `${base}${q}`);
        }
      });
    }
  }

  return Array.from(new Set(candidates));
}

// 🔑 Core safe fetch
async function tryFetchOHLCV(ex, symbol, timeframe, since, limit) {
  const candidates = generateSymbolCandidates(symbol);
  let lastErr = null;

  for (const candidate of candidates) {
    try {
      // CCXT fetchOHLCV is robust and will handle fetching the latest candles if 'since' is undefined.
      return await ex.fetchOHLCV(candidate, timeframe, since, limit);
    } catch (err) {
      lastErr = err;
    }
  }

  const friendly = lastErr ? lastErr.message || lastErr.toString() : "unknown";
  throw new Error(`Failed to fetch OHLCV for ${symbol}: ${friendly}`);
}

// 🔑 Public API
export async function fetchOHLCVMultiSafe(
  symbol,
  timeframe,
  limit, // Limit is now optional, will be defaulted below
  startDate,
  endDate,
  exchangeId = "binance"
) {
  // Use a slightly different key for the default limit case vs. an explicit one.
  const effectiveLimit = limit || 200;
  const key = cacheKey(exchangeId, symbol, timeframe, effectiveLimit, startDate, endDate);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  if (!ccxt[exchangeId]) {
    throw new Error(`Exchange ${exchangeId} not available in ccxt`);
  }

  const ex = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 15000 });
  try {
    await ex.loadMarkets();
  } catch {
    // ignore loadMarkets failure, ccxt retries internally
  }

  let candles = [];
  let truncated = false;

  // --- THIS IS THE FIX ---
  // The logic is now restructured to prioritize date-range queries,
  // but will correctly fall back to a limit-based query otherwise.

  // ✅ Priority Mode: Fetch by date range if provided.
  if (startDate && endDate) {
    let since = new Date(startDate).getTime();
    const until = new Date(endDate).getTime();
    const step = TIMEFRAME_MS[timeframe] || 3_600_000;

    while (since < until && candles.length < MAX_CANDLES) {
      const batch = await tryFetchOHLCV(ex, symbol, timeframe, since, 1000);
      if (!batch.length) break;

      candles.push(...batch);
      since = batch[batch.length - 1][0] + step;
    }
    truncated = candles.length >= MAX_CANDLES;
  }
  // ✅ Default Mode: Fetch the last N candles.
  else {
    candles = await tryFetchOHLCV(ex, symbol, timeframe, undefined, effectiveLimit);
    // This mode, by definition, is not truncated in the same way as a date range.
    truncated = false;
  }

  const result = { candles, truncated };
  cache.set(key, { ts: Date.now(), value: result });
  return result;
}

export default { fetchOHLCVMultiSafe };
