// File: backend/services/candleService.js
import ccxt from "ccxt";

const CACHE_TTL_MS = 1000 * 60 * 1; // Cache for 1 minute in production
const cache = new Map();
const MAX_CANDLES = 50000;
const TIMEFRAME_MS = { "1m": 60000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };

function cacheKey(exchangeId, symbol, timeframe, startDate, endDate) {
  return `${exchangeId}::${symbol}::${timeframe}::${startDate || ""}::${endDate || ""}`;
}

function generateSymbolCandidates(symbol) {
  const s = symbol.replace(/[-_/]/g, "").toUpperCase();
  const base = s.replace(/(USDT|USD|BTC|ETH)$/, "");
  const quote = s.substring(base.length);
  if (!base || !quote) return [symbol]; // Fallback
  return [`${base}/${quote}`, `${base}-${quote}`, `${base}${quote}`];
}

async function tryFetchOHLCV(exchange, symbol, timeframe, since, limit) {
  const candidates = generateSymbolCandidates(symbol);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      console.log(`[CandleService] Attempting to fetch ${candidate} for ${exchange.id}`);
      const candles = await exchange.fetchOHLCV(candidate, timeframe, since, limit);
      if (candles.length > 0) {
        console.log(`[CandleService] Successfully fetched ${candles.length} candles for ${candidate}`);
        return candles;
      }
    } catch (err) {
      lastError = err;
      // Log the attempt failure but continue trying other candidates
      console.warn(`[CandleService] Failed to fetch ${candidate}: ${err.message}`);
    }
  }
  // If all candidates failed, throw the last known error
  throw new Error(`Failed to fetch OHLCV for ${symbol} on ${exchange.id} after trying all formats. Last error: ${lastError?.message || 'Unknown error'}`);
}


export async function fetchOHLCVMultiSafe(symbol, timeframe, limit, startDate, endDate, exchangeId = "binance") {
  const key = cacheKey(exchangeId, symbol, timeframe, startDate, endDate);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  if (!ccxt[exchangeId]) {
    throw new Error(`Exchange ${exchangeId} not available in ccxt`);
  }

  const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 20000 });
  
  // FIX: More robust market loading with proper error logging
  try {
    await exchange.loadMarkets();
    console.log(`[CandleService] Successfully loaded markets for ${exchange.id}`);
  } catch (err) {
    // This is not a fatal error, ccxt can often work without pre-loading markets.
    // We log it as a warning and continue.
    console.warn(`[CandleService] Warning: Could not pre-load markets for ${exchange.id}. Proceeding anyway. Error: ${err.message}`);
  }

  let candles = [];
  if (startDate && endDate) {
    let since = new Date(startDate).getTime();
    const until = new Date(endDate).getTime();
    const step = TIMEFRAME_MS[timeframe] || 3600000;

    while (since < until && candles.length < MAX_CANDLES) {
      const batch = await tryFetchOHLCV(exchange, symbol, timeframe, since, 1000);
      if (!batch || batch.length === 0) break;
      candles.push(...batch);
      since = batch[batch.length - 1][0] + step;
    }
  } else {
    candles = await tryFetchOHLCV(exchange, symbol, timeframe, undefined, limit || 200);
  }

  const result = { candles, truncated: candles.length >= MAX_CANDLES };
  cache.set(key, { ts: Date.now(), value: result });
  return result;
}
