// File: backend/services/backtestDataService.js
// UPGRADED: Caching logic now uses 'findOneAndUpdate' with upsert to prevent duplicate key errors.

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

async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
  try {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    return (candles && candles.length > 0) ? candles : null;
  } catch (e) { return null; }
}

// --- Get Backtest Options (no changes) ---
export async function getBacktestOptionsData() {
  const cacheKey = 'backtestOptions';
  const cachedEntry = await Cache.findOne({ key: cacheKey });
  if (cachedEntry) return cachedEntry.data;

  const cryptoApiUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1';
  try {
    const response = await axios.get(cryptoApiUrl);
    const topCryptos = response.data.map(coin => coin.symbol.toUpperCase() + '/USD');
    
    const validSymbols = new Set();
    const supportedTimeframes = new Set(['1h', '4h', '1d']);
    const tempExchanges = US_EXCHANGES.map(id => new ccxt[id]());
    
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

    // ✅ UPGRADED: Use findOneAndUpdate with upsert to prevent duplicate errors
    await Cache.findOneAndUpdate(
        { key: cacheKey },
        { data: newOptions, expiresAt: new Date(Date.now() + CACHE_DURATION) },
        { upsert: true, new: true }
    );
    return newOptions;
  } catch (err) {
    console.error("❌ Failed to fetch backtest options:", err);
    return { symbols: ['BTC/USD', 'ETH/USD'], timeframes: ['1d', '4h', '1h'] };
  }
}

// --- ✅ UPGRADED: Main data fetching function ---
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
  const cacheKey = `candles::${symbol}::${timeframe}`;
  const cachedEntry = await Cache.findOne({ key: cacheKey });
  if (cachedEntry) return cachedEntry.data;
  
  const baseTimeframe = '1h';
  const baseCacheKey = `candles::${symbol}::${baseTimeframe}`;
  const baseCachedEntry = await Cache.findOne({ key: baseCacheKey });
  
  let rawCandles;

  if (baseCachedEntry) {
      rawCandles = baseCachedEntry.data.candles;
  } else {
      for (const exchangeId of US_EXCHANGES) {
          const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000 });
          const symbolFormats = [symbol, symbol.replace('/', '-')];
          for (const format of symbolFormats) {
              const fetchedCandles = await fetchCandlesWithRetry(exchange, format, baseTimeframe);
              if (fetchedCandles) {
                  rawCandles = fetchedCandles;
                  const result = { candles: rawCandles, exchange: exchangeId };
                  const expiresAt = new Date(Date.now() + CACHE_DURATION);
                  // ✅ UPGRADED: Use findOneAndUpdate with upsert
                  await Cache.findOneAndUpdate(
                      { key: baseCacheKey },
                      { data: result, expiresAt },
                      { upsert: true, new: true }
                  );
                  break; 
              }
          }
          if (rawCandles) break;
      }
  }

  if (!rawCandles || rawCandles.length === 0) {
    throw new Error(`Failed to fetch base candle data for ${symbol}.`);
  }

  const resampled = resampleCandles(rawCandles, timeframe);
  const finalResult = { candles: resampled, exchange: baseCachedEntry?.data.exchange || 'multiple' };
  
  const expiresAt = new Date(Date.now() + CACHE_DURATION);
  // ✅ UPGRADED: Use findOneAndUpdate with upsert
  await Cache.findOneAndUpdate(
      { key: cacheKey },
      { data: finalResult, expiresAt },
      { upsert: true, new: true }
  );

  return finalResult;
}

