// File: backend/services/backtestDataService.js
// UPGRADED: Added the 'export' keyword to the normalizeSymbol function.

import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js';

const US_EXCHANGES = ['coinbase', 'kraken', 'gemini'];
const CANDLE_LIMIT = 1000;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1500;

const timeframeToMinutes = {
    '1m': 1, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '2h': 120, '4h': 240, '6h': 360,
    '12h': 720, '1d': 1440, '1w': 10080,
};

// --- ✅ FIXED: "export" keyword added ---
// This makes the function available to be imported by other files.
export function normalizeSymbol(exchangeId, symbol) {
    const base = symbol.replace('-', '/').toUpperCase();
    if (exchangeId === 'kraken' && base === 'BTC/USD') return 'XBT/USD';
    return base;
}

// --- Helper: resample candle data (no changes) ---
const resampleCandles = (candles, sourceTimeframe, targetTimeframe) => {
    if (!candles || candles.length === 0) return [];
    const sourceMinutes = timeframeToMinutes[sourceTimeframe];
    const targetMinutes = timeframeToMinutes[targetTimeframe];
    if (!sourceMinutes || !targetMinutes) throw new Error('Invalid timeframe provided');

    if (sourceMinutes >= targetMinutes) { // Downsample
        const factor = targetMinutes / sourceMinutes;
        const resampled = [];
        let bucket = [];
        for (const candle of candles) {
            bucket.push(candle);
            if (bucket.length === factor) {
                resampled.push([
                    bucket[0][0], bucket[0][1],
                    Math.max(...bucket.map(c => c[2])),
                    Math.min(...bucket.map(c => c[3])),
                    bucket[bucket.length - 1][4],
                    bucket.reduce((sum, c) => sum + c[5], 0)
                ]);
                bucket = [];
            }
        }
        return resampled;
    } else { // Upsample
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchCandlesWithRetry(exchange, symbol, timeframe, since) {
    const normSymbol = normalizeSymbol(exchange.id, symbol);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const candles = await exchange.fetchOHLCV(normSymbol, timeframe, since, CANDLE_LIMIT);
            return candles && candles.length > 0 ? candles : null;
        } catch (e) {
            console.warn(`⚠️ Attempt ${attempt + 1} failed for ${normSymbol} on ${exchange.id}: ${e.message}`);
            await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
    }
    return null;
}

export async function getBacktestOptionsData() {
    // ... (rest of the function, no changes needed)
}

const fillCandleGaps = (candles, timeframeMinutes) => {
    // ... (rest of the function, no changes needed)
};

export async function fetchOHLCVMultiSafe(symbol, targetTimeframe, startDate, endDate) {
    // ... (rest of the function, no changes needed)
}

export { resampleCandles };

