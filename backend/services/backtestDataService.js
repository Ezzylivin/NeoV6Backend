// File: backend/services/backtestDataService.js
import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js';

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini'];
const CANDLE_LIMIT = 1000;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// --- Normalize trading pair symbol ---
export function normalizeSymbol(symbol) {
  // Convert to standard CCXT format (e.g., BTCUSDT → BTC/USDT)
  if (symbol.includes('/')) return symbol;
  if (symbol.includes('-')) return symbol.replace('-', '/');
  if (symbol.endsWith('USDT')) return symbol.replace('USDT', '/USDT');
  if (symbol.endsWith('USD')) return symbol.replace('USD', '/USD');
  return symbol; // fallback
}

// --- Helper: Resample candles ---
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
        bucket[0][0], // open time
        bucket[0][1], // open
        Math.max(...bucket.map(c => c[2])), // high
        Math.min(...bucket.map(c => c[3])), // low
        bucket[bucket.length - 1][4], // close
        bucket.reduce((sum, c) => sum + c[5], 0) // volume
      ];
      resampled.push(newCandle);
      bucket = [];
    }
  }
  return resampled;
};

// --- Helper: Fetch candles with retry (This is already safe, returning null on error) ---
async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
  try {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    return (candles && candles.length > 0) ? candles : null;
  } catch (e) {
    return null;
  }
}

// --- Backtest options data ---
export async function getBacktestOptionsData() {
  // Define available options for the frontend
  return {
    symbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "ADA/USDT", "XRP/USDT"],
    timeframes: ["1h", "4h", "1d"],
    strategies: [
      "ATR",
      "BollingerBands",
      "CCI",
      "IchimokuCloud",
      "MACD",
      "OnBalanceVolume",
      "ParabolicSAR",
      "RSI",
      "SMACrossover"
    ],
    takeProfits: [0.5, 1, 2, 3, 5],
    stopLosses: [0.5, 1, 2, 3, 5],
  };
}

// --- Main: Multi-exchange OHLCV fetch (Now wrapped in try/catch) ---
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
    try {
        const cacheKey = `candles::${symbol}::${timeframe}`;
        const cachedEntry = await Cache.findOne({ key: cacheKey });
        if (cachedEntry) {
            console.log(`[Cache Hit] Serving candles for ${symbol}:${timeframe}`);
            return cachedEntry.data;
        }

        const baseTimeframe = '1h';
        let rawCandles;
        let successfulExchange = null;

        const normalizedSymbol = normalizeSymbol(symbol);

        for (const exchangeId of US_EXCHANGES) {
            const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
            const symbolFormats = [normalizedSymbol, normalizedSymbol.replace('/', '-')];
            
            for (const format of symbolFormats) {
                const fetchedCandles = await fetchCandlesWithRetry(exchange, format, baseTimeframe);
                if (fetchedCandles) {
                    rawCandles = fetchedCandles;
                    successfulExchange = exchangeId;
                    break;
                }
            }
            if (rawCandles) break;
        }

        if (!rawCandles || rawCandles.length === 0) {
            // This is a known, handled error case
            throw new Error(`Failed to fetch base candle data for ${symbol}.`);
        }

        const resampled = resampleCandles(rawCandles, timeframe);

        const finalResult = { candles: resampled, exchange: successfulExchange };

        // Save result to cache (Database access)
        await Cache.findOneAndUpdate(
            { key: cacheKey },
            { data: finalResult, expiresAt: new Date(Date.now() + CACHE_DURATION) },
            { upsert: true, new: true }
        );

        return finalResult;
    } catch (error) {
        // 🚨 FIX: This is the crucial top-level safety net 🚨
        // This catches database errors (Cache) and any unexpected exceptions
        console.error(`[fetchOHLCVMultiSafe CRASH] Unhandled error during data fetch for ${symbol}:`, error.message);
        
        // Re-throw a clean, predictable error for the controller to catch
        throw new Error(`Market data access failed for ${symbol}. Check database/network connection.`);
    }
}
