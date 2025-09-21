// File: backend/services/backtestDataService.js
// UPGRADED: Now supports full date ranges with pagination, not limited to 1000 candles.

import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js';

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini'];
const CANDLE_LIMIT = 1000;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// --- Helper: resample candle data ---
const resampleCandles = (candles, targetTimeframe) => {
    if (!candles || candles.length === 0) return [];
    const timeframeToMinutes = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };
    const baseMinutes = 1;
    const targetMinutes = timeframeToMinutes[targetTimeframe];
    if (!targetMinutes || targetMinutes === baseMinutes) return candles;

    const resampled = [];
    let bucket = [];
    const candlesPerBucket = targetMinutes / baseMinutes;

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

// --- Helper: fetch candles with retry ---
async function fetchCandlesWithRetry(exchange, symbol, timeframe, since) {
    try {
        const candles = await exchange.fetchOHLCV(symbol, timeframe, since, CANDLE_LIMIT);
        return (candles && candles.length > 0) ? candles : null;
    } catch (e) {
        return null;
    }
}

// --- Get Backtest Options (unchanged) ---
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

// --- ✅ UPGRADED: Paginated OHLCV fetch with date range ---
export async function fetchOHLCVMultiSafe(symbol, timeframe, startDate, endDate) {
    const cacheKey = `candles::${symbol}::${timeframe}::${startDate || 'all'}::${endDate || 'now'}`;
    const cachedEntry = await Cache.findOne({ key: cacheKey });
    if (cachedEntry) return cachedEntry.data;

    const exchanges = US_EXCHANGES.map(id => new ccxt[id]({ enableRateLimit: true, timeout: 30000 }));
    let allCandles = [];

    for (const exchange of exchanges) {
        try {
            let since = startDate ? new Date(startDate).getTime() : undefined;
            const endTs = endDate ? new Date(endDate).getTime() : Date.now();

            while (true) {
                const batch = await fetchCandlesWithRetry(exchange, symbol, timeframe, since);
                if (!batch || batch.length === 0) break;

                allCandles = allCandles.concat(batch);

                const lastTimestamp = batch[batch.length - 1][0];
                if (lastTimestamp >= endTs) break;

                // Move "since" forward to avoid duplicates
                since = lastTimestamp + 1;
                if (batch.length < CANDLE_LIMIT) break; // no more data
            }

            if (allCandles.length > 0) {
                break; // success with this exchange
            }
        } catch (e) {
            console.warn(`⚠️ Exchange ${exchange.id} failed for ${symbol}:`, e.message);
        }
    }

    if (allCandles.length === 0) {
        throw new Error(`Failed to fetch OHLCV data for ${symbol}.`);
    }

    // Sort & dedupe
    allCandles = Array.from(new Map(allCandles.map(c => [c[0], c])).values()).sort((a, b) => a[0] - b[0]);

    const result = { candles: allCandles, exchange: 'multi' };
    const expiresAt = new Date(Date.now() + CACHE_DURATION);
    await Cache.findOneAndUpdate(
        { key: cacheKey },
        { data: result, expiresAt },
        { upsert: true, new: true }
    );

    return result;
}
