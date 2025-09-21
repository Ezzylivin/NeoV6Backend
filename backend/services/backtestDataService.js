// File: backend/services/backtestDataService.js
// UPGRADED: The data fetching service now returns the name of the exchange it successfully connected to.

import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js';

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini'];
const CANDLE_LIMIT = 1000;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// --- Helper function to resample candle data (no changes) ---
const resampleCandles = (candles, targetTimeframe) => {
    if (!candles || candles.length === 0) return [];
    const timeframeToHours = { '1h': 1, '4h': 4, '1d': 24 };
    const baseHours = 1;
    const targetHours = timeframeToHours[targetTimeframe];
    if (!targetHours || targetHours === baseHours) return candles;

    const resampled = [];
    let bucket = [];
    const candlesPerBucket = targetHours / baseHours;

    for (const candle of candles) {
        bucket.push(candle);
        if (bucket.length === candlesPerBucket) {
            const newCandle = [
                bucket[0][0], bucket[0][1],
                Math.max(...bucket.map(c => c[2])),
                Math.min(...bucket.map(c => c[3])),
                bucket[bucket.length - 1][4],
                bucket.reduce((sum, c) => sum + c[5], 0)
            ];
            resampled.push(newCandle);
            bucket = [];
        }
    }
    return resampled;
};

// --- Other helper functions (no changes) ---
async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
  try {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    return (candles && candles.length > 0) ? candles : null;
  } catch (e) { return null; }
}

export async function getBacktestOptionsData() {
  // ... (existing code, no changes needed)
}


// --- ✅ UPGRADED: Main data fetching function ---
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
  const cacheKey = `candles::${symbol}::${timeframe}`;
  const cachedEntry = await Cache.findOne({ key: cacheKey });
  if (cachedEntry) {
    return cachedEntry.data; // This will now include the exchange name
  }
  
  const baseTimeframe = '1h';
  let rawCandles;
  let successfulExchange = null; // Variable to store the name of the successful exchange

  for (const exchangeId of US_EXCHANGES) {
      const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
      const symbolFormats = [symbol, symbol.replace('/', '-')];
      for (const format of symbolFormats) {
          const fetchedCandles = await fetchCandlesWithRetry(exchange, format, baseTimeframe);
          if (fetchedCandles) {
              rawCandles = fetchedCandles;
              successfulExchange = exchangeId; // ✅ Store the name of the exchange
              break; 
          }
      }
      if (rawCandles) break;
  }

  if (!rawCandles || rawCandles.length === 0) {
    throw new Error(`Failed to fetch base candle data for ${symbol}.`);
  }

  const resampled = resampleCandles(rawCandles, timeframe);
  
  // ✅ Include the exchange name in the final result and the cache
  const finalResult = { candles: resampled, exchange: successfulExchange };
  
  await Cache.findOneAndUpdate(
      { key: cacheKey },
      { data: finalResult, expiresAt: new Date(Date.now() + CACHE_DURATION) },
      { upsert: true, new: true }
  );

  return finalResult;
}

