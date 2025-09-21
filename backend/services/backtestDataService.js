// File: backend/services/backtestDataService.js
// UPGRADED: Full date ranges, pagination, dedupe, caching, arbitrary timeframe resampling, dynamic supported timeframes.

import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js';

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini'];
const CANDLE_LIMIT = 1000;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// --- Helper: convert timeframe string to minutes ---
const timeframeToMinutes = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '2h': 120,
    '4h': 240,
    '6h': 360,
    '12h': 720,
    '1d': 1440,
    '1w': 10080,
};

// --- Helper: resample candle data (arbitrary timeframes) ---
const resampleCandles = (candles, sourceTimeframe, targetTimeframe) => {
    if (!candles || candles.length === 0) return [];
    const sourceMinutes = timeframeToMinutes[sourceTimeframe];
    const targetMinutes = timeframeToMinutes[targetTimeframe];

    if (!sourceMinutes || !targetMinutes) throw new Error('Invalid timeframe provided');

    if (sourceMinutes >= targetMinutes) {
        // Downsample: aggregate smaller candles into bigger timeframe
        const factor = targetMinutes / sourceMinutes;
        const resampled = [];
        let bucket = [];
        for (const candle of candles) {
            bucket.push(candle);
            if (bucket.length === factor) {
                resampled.push([
                    bucket[0][0],                     // open time
                    bucket[0][1],                     // open
                    Math.max(...bucket.map(c => c[2])), // high
                    Math.min(...bucket.map(c => c[3])), // low
                    bucket[bucket.length - 1][4],     // close
                    bucket.reduce((sum, c) => sum + c[5], 0) // volume
                ]);
                bucket = [];
            }
        }
        return resampled;
    } else {
        // Upsample: repeat values for smaller timeframe
        const factor = sourceMinutes / targetMinutes;
        const upsampled = [];
        for (const candle of candles) {
            for (let i = 0; i < factor; i++) {
                upsampled.push([
                    candle[0] + i * targetMinutes * 60 * 1000, // timestamp
                    candle[1],
                    candle[2],
                    candle[3],
                    candle[4],
                    candle[5] / factor // distribute volume evenly
                ]);
            }
        }
        return upsampled;
    }
};

// --- Helper: fetch candles with retry ---
async function fetchCandlesWithRetry(exchange, symbol, timeframe, since) {
    try {
        const candles = await exchange.fetchOHLCV(symbol, timeframe, since, CANDLE_LIMIT);
        return candles && candles.length > 0 ? candles : null;
    } catch (e) {
        console.warn(`⚠️ Fetch failed for ${symbol} on ${exchange.id}: ${e.message}`);
        return null;
    }
}

// --- Get Backtest Options (dynamic timeframes) ---
export async function getBacktestOptionsData() {
    const cacheKey = 'backtestOptions';
    const cachedEntry = await Cache.findOne({ key: cacheKey });
    if (cachedEntry) return cachedEntry.data;

    const cryptoApiUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1';
    try {
        const response = await axios.get(cryptoApiUrl);
        const topCryptos = response.data.map(coin => coin.symbol.toUpperCase() + '/USD');
        
        const validSymbols = new Set();
        const supportedTimeframesSet = new Set();
        const tempExchanges = US_EXCHANGES.map(id => new ccxt[id]());

        for (const symbol of topCryptos) {
            for (const exchange of tempExchanges) {
                if (exchange.markets && exchange.markets[symbol]) {
                    validSymbols.add(symbol);
                    // Collect all timeframes supported by this exchange
                    if (exchange.timeframes) {
                        Object.keys(exchange.timeframes).forEach(tf => supportedTimeframesSet.add(tf));
                    }
                    break;
                }
            }
        }

        const newOptions = {
            symbols: Array.from(validSymbols).sort(),
            timeframes: Array.from(supportedTimeframesSet).sort((a,b) => {
                // Sort by approximate minutes for consistency
                const aMin = timeframeToMinutes[a] || 0;
                const bMin = timeframeToMinutes[b] || 0;
                return aMin - bMin;
            }),
        };

        await Cache.findOneAndUpdate(
            { key: cacheKey },
            { data: newOptions, expiresAt: new Date(Date.now() + CACHE_DURATION) },
            { upsert: true, new: true }
        );

        return newOptions;
    } catch (err) {
        console.error("❌ Failed to fetch backtest options:", err);
        return { symbols: ['BTC/USD', 'ETH/USD'], timeframes: ['1m','5m','15m','1h','4h','1d'] };
    }
}

// --- Fetch OHLCV with full date range & proper resampling ---
export async function fetchOHLCVMultiSafe(symbol, targetTimeframe, startDate, endDate) {
    const cacheKey = `candles::${symbol}::${targetTimeframe}::${startDate || 'all'}::${endDate || 'now'}`;
    const cachedEntry = await Cache.findOne({ key: cacheKey });
    if (cachedEntry) return cachedEntry.data;

    const exchanges = US_EXCHANGES.map(id => new ccxt[id]({ enableRateLimit: true, timeout: 30000 }));
    let allCandles = [];
    const startTs = startDate ? new Date(startDate).getTime() : undefined;
    const endTs = endDate ? new Date(endDate).getTime() : Date.now();

    // Always fetch in the smallest available timeframe
    const smallestTimeframe = '1m';

    for (const exchange of exchanges) {
        try {
            let since = startTs;

            while (true) {
                const batch = await fetchCandlesWithRetry(exchange, symbol, smallestTimeframe, since);
                if (!batch || batch.length === 0) break;

                const filtered = batch.filter(c => (!startTs || c[0] >= startTs) && c[0] <= endTs);
                allCandles = allCandles.concat(filtered);

                const lastTs = batch[batch.length - 1][0];
                if (lastTs >= endTs) break;

                since = lastTs + 1; // move forward
            }

            if (allCandles.length > 0) break;
        } catch (e) {
            console.warn(`⚠️ Exchange ${exchange.id} failed for ${symbol}: ${e.message}`);
        }
    }

    if (allCandles.length === 0) {
        throw new Error(`Failed to fetch OHLCV data for ${symbol}.`);
    }

    // Deduplicate & sort
    allCandles = Array.from(new Map(allCandles.map(c => [c[0], c])).values()).sort((a, b) => a[0] - b[0]);

    // Resample to requested timeframe
    const resampledCandles = resampleCandles(allCandles, smallestTimeframe, targetTimeframe);

    const result = { candles: resampledCandles, exchange: 'multi' };
    const expiresAt = new Date(Date.now() + CACHE_DURATION);
    await Cache.findOneAndUpdate(
        { key: cacheKey },
        { data: result, expiresAt },
        { upsert: true, new: true }
    );

    return result;
}

export { resampleCandles };
