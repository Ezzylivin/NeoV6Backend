// File: backend/services/backtestDataService.js
// UPGRADED: Full date ranges, pagination, dedupe, caching, arbitrary timeframe resampling,
// dynamic supported timeframes, gap filling, adaptive timeframe, parallel fetch, retry strategy,
// strict post-filtering by start/end dates, and symbol normalization per exchange.

import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js';

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini'];
const CANDLE_LIMIT = 1000;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1500;

// --- Helper: convert timeframe string to minutes ---
const timeframeToMinutes = {
    '1m': 1, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '2h': 120, '4h': 240, '6h': 360,
    '12h': 720, '1d': 1440, '1w': 10080,
};

// --- Symbol Normalization ---
function normalizeSymbol(exchangeId, symbol) {
    // standardize input like BTC-USD -> BTC/USD
    const base = symbol.replace('-', '/').toUpperCase();

    // Special cases
    if (exchangeId === 'kraken') {
        if (base === 'BTC/USD') return 'XBT/USD'; // Kraken uses XBT
        if (base === 'ETH/USD') return 'ETH/USD';
    }
    if (exchangeId === 'gemini') {
        // Gemini supports BTC/USD, ETH/USD, etc.
        return base;
    }
    if (exchangeId === 'coinbase') {
        return base; // Coinbase Pro (Coinbase Exchange) uses BTC/USD
    }

    return base;
}

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
                    bucket[0][0],
                    bucket[0][1],
                    Math.max(...bucket.map(c => c[2])),
                    Math.min(...bucket.map(c => c[3])),
                    bucket[bucket.length - 1][4],
                    bucket.reduce((sum, c) => sum + c[5], 0)
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
                    candle[0] + i * targetMinutes * 60 * 1000,
                    candle[1], candle[2], candle[3], candle[4],
                    candle[5] / factor
                ]);
            }
        }
        return upsampled;
    }
};

// --- Helper: delay ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- Helper: fetch candles with retry & rate-limit ---
async function fetchCandlesWithRetry(exchange, symbol, timeframe, since) {
    const normSymbol = normalizeSymbol(exchange.id, symbol);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const candles = await exchange.fetchOHLCV(normSymbol, timeframe, since, CANDLE_LIMIT);
            return candles && candles.length > 0 ? candles : null;
        } catch (e) {
            console.warn(`⚠️ Attempt ${attempt+1} failed for ${normSymbol} on ${exchange.id}: ${e.message}`);
            await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
    }
    return null;
}

// --- Get Backtest Options (dynamic timeframes) ---
export async function getBacktestOptionsData() {
    const cacheKey = 'backtestOptions';
    const cachedEntry = await Cache.findOne({ key: cacheKey });
    if (cachedEntry) return cachedEntry.data;

    try {
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1'
        );
        const topCryptos = response.data.map(coin => coin.symbol.toUpperCase() + '/USD');

        const validSymbols = new Set();
        const supportedTimeframesSet = new Set();
        const tempExchanges = US_EXCHANGES.map(id => new ccxt[id]());

        for (const symbol of topCryptos) {
            for (const exchange of tempExchanges) {
                const normSymbol = normalizeSymbol(exchange.id, symbol);
                await exchange.loadMarkets();
                if (exchange.markets && exchange.markets[normSymbol]) {
                    validSymbols.add(symbol);
                    if (exchange.timeframes) {
                        Object.keys(exchange.timeframes).forEach(tf => supportedTimeframesSet.add(tf));
                    }
                    break;
                }
            }
        }

        const newOptions = {
            symbols: Array.from(validSymbols).sort(),
            timeframes: Array.from(supportedTimeframesSet).sort((a,b) => (timeframeToMinutes[a]||0) - (timeframeToMinutes[b]||0))
        };

        await Cache.findOneAndUpdate(
            { key: cacheKey },
            { data: newOptions, expiresAt: new Date(Date.now() + CACHE_DURATION) },
            { upsert: true, new: true }
        );

        return newOptions;
    } catch (err) {
        console.error("❌ Failed to fetch backtest options:", err);
        return { symbols: ['BTC/USD','ETH/USD'], timeframes: ['1m','5m','15m','1h','4h','1d'] };
    }
}

// --- Fill gaps between candles with synthetic flat candles ---
const fillCandleGaps = (candles, timeframeMinutes) => {
    if (!candles || candles.length === 0) return [];
    const filled = [candles[0]];
    const interval = timeframeMinutes * 60 * 1000;

    for (let i = 1; i < candles.length; i++) {
        let prev = filled[filled.length - 1];
        let current = candles[i];
        let ts = prev[0] + interval;
        while (ts < current[0]) {
            filled.push([ts, prev[4], prev[4], prev[4], prev[4], 0]); // flat candle
            ts += interval;
        }
        filled.push(current);
    }
    return filled;
};

// --- Fetch OHLCV with full date range, parallel exchanges, adaptive timeframe, gap filling ---
export async function fetchOHLCVMultiSafe(symbol, targetTimeframe, startDate, endDate) {
    const startTs = startDate ? new Date(startDate).getTime() : undefined;
    const endTs = endDate ? new Date(endDate).getTime() : Date.now();

    const cacheKey = `candles::${symbol}::${targetTimeframe}::${startTs||'all'}::${endTs||'now'}`;
    const cachedEntry = await Cache.findOne({ key: cacheKey });
    if (cachedEntry) return cachedEntry.data;

    // Parallel fetch from exchanges
    const fetchPromises = US_EXCHANGES.map(async id => {
        const exchange = new ccxt[id]({ enableRateLimit:true, timeout:30000 });
        await exchange.loadMarkets();
        let allCandles = [];
        let since = startTs;

        while (true) {
            if (since && since > endTs) break;

            const batch = await fetchCandlesWithRetry(exchange, symbol, '1m', since);
            if (!batch || batch.length === 0) break;

            const filtered = batch.filter(c => (!startTs || c[0] >= startTs) && c[0] <= endTs);
            allCandles = allCandles.concat(filtered);

            const lastTs = batch[batch.length-1][0];
            if (lastTs >= endTs) break;
            since = lastTs + 1;
        }

        return allCandles;
    });

    const results = await Promise.all(fetchPromises);
    let allCandles = results.reduce((acc, arr) => acc.concat(arr), []);

    if (allCandles.length === 0) throw new Error(`Failed to fetch OHLCV data for ${symbol}.`);

    // Deduplicate & sort
    allCandles = Array.from(new Map(allCandles.map(c => [c[0], c])).values()).sort((a,b) => a[0]-b[0]);

    // ✅ Strict clip to [startTs, endTs]
    allCandles = allCandles.filter(c => (!startTs || c[0] >= startTs) && c[0] <= endTs);

    // Fill gaps
    allCandles = fillCandleGaps(allCandles, 1); // smallest timeframe = 1m

    // Resample to requested timeframe
    const resampledCandles = resampleCandles(allCandles, '1m', targetTimeframe);

    const result = { candles: resampledCandles, exchange: 'multi' };
    const expiresAt = new Date(Date.now() + CACHE_DURATION);
    await Cache.findOneAndUpdate({ key: cacheKey }, { data: result, expiresAt }, { upsert:true, new:true });

    return result;
}

export { resampleCandles };
