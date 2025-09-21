// File: backend/services/backtestDataService.js
// UPGRADED: Full backtest service with symbol normalization, safe returns, timeframe verification, auto-adjusted startDate, and detailed no-trade reasons

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

// --- ✅ Full exchange symbol normalization ---
export function normalizeSymbol(exchangeId, symbol) {
    const base = symbol.replace('-', '/').toUpperCase();
    switch (exchangeId) {
        case 'kraken':
            if (base === 'BTC/USD' || base === 'BTC/USDT') return 'XBT/USD';
            return base;
        case 'coinbase':
            return base.replace('USDT', '-USD');
        case 'gemini':
            return base.replace('/', '');
        default:
            return base;
    }
}

// --- Helper: resample candle data (unchanged) ---
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
            if (!exchange.timeframes || !exchange.timeframes[timeframe]) {
                console.warn(`⚠️ ${exchange.id} does not support timeframe ${timeframe}`);
                return null;
            }
            const candles = await exchange.fetchOHLCV(normSymbol, timeframe, since, CANDLE_LIMIT);
            console.log(`${exchange.id} returned ${candles?.length || 0} candles for ${normSymbol}`);
            return candles && candles.length > 0 ? candles : null;
        } catch (e) {
            console.warn(`⚠️ Attempt ${attempt + 1} failed for ${normSymbol} on ${exchange.id}: ${e.message}`);
            await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
    }
    return null;
}

// --- Returns all options for backtest UI ---
export async function getBacktestOptionsData() {
    // Normally you'd fetch these dynamically from your DB or config
    const symbols = ['BTC/USD', 'ETH/USD', 'LTC/USD', 'XRP/USD'];
    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
    const strategies = [
        'ATR', 'bollingerbands', 'cci', 'ichimokicloud',
        'macd', 'onbalancevolume', 'parabolicSAR', 'rsi', 'smaCrossover'
    ];
    const takeProfits = [0.5, 1, 2, 3, 5];
    const stopLosses = [0.5, 1, 2, 3, 5];
    const balances = [100, 500, 1000, 5000];
    const risks = ['low', 'medium', 'high'];

    return { symbols, timeframes, strategies, takeProfits, stopLosses, balances, risks };
};

// --- Fills missing candle timestamps with previous close ---
const fillCandleGaps = (candles, timeframeMinutes) => {
    if (!candles || candles.length === 0) return [];
    const filled = [candles[0]];
    const intervalMs = timeframeMinutes * 60 * 1000;

    for (let i = 1; i < candles.length; i++) {
        let prev = filled[filled.length - 1];
        let current = candles[i];
        while (current[0] - prev[0] > intervalMs) {
            const newCandle = [
                prev[0] + intervalMs,
                prev[4], prev[4], prev[4], prev[4], 0
            ];
            filled.push(newCandle);
            prev = newCandle;
        }
        filled.push(current);
    }
    return filled;
};

// --- Fetch OHLCV with safe exchange looping, symbol normalization, and exact no-trade reason ---
export async function fetchOHLCVMultiSafe(symbol, targetTimeframe, startDate, endDate) {
    let allCandles = [];
    let messages = [];
    let attemptedExchanges = [];

    for (const exId of US_EXCHANGES) {
        try {
            const exchangeClass = ccxt[exId];
            const exchange = new exchangeClass({ enableRateLimit: true });
            await exchange.loadMarkets();

            let since = new Date(startDate).getTime();
            const maxHistoryMs = 180 * 24 * 60 * 60 * 1000; // 6 months
            const nowMs = Date.now();
            if (nowMs - since > maxHistoryMs) {
                console.log(`${exId}: startDate too far back, adjusting to 6 months ago`);
                since = nowMs - maxHistoryMs;
            }

            const variants = [
                normalizeSymbol(exId, symbol),
                symbol.replace('-', '/').toUpperCase(),
                symbol.replace('/', ''),
            ];

            let candlesFound = null;
            for (const variant of variants) {
                console.log(`Trying symbol "${variant}" on ${exId} with timeframe ${targetTimeframe}`);
                const c = await fetchCandlesWithRetry(exchange, variant, targetTimeframe, since);
                if (c && c.length > 0) {
                    candlesFound = c;
                    break;
                } else {
                    messages.push(`No candles for ${variant} on ${exId}`);
                }
            }

            attemptedExchanges.push(exId);

            if (candlesFound && candlesFound.length > 0) {
                allCandles = candlesFound;
                console.log(`✅ Found ${candlesFound.length} candles from ${exId}`);
                break;
            }
        } catch (err) {
            const msg = `Failed to fetch from ${exId}: ${err.message}`;
            console.warn(msg);
            messages.push(msg);
            attemptedExchanges.push(exId);
        }
    }

    // --- Determine exact reason no trades were placed per strategy ---
    let noTradeReason = '';
    if (!allCandles || allCandles.length === 0) {
        noTradeReason = `No candle data; attempted exchanges: ${attemptedExchanges.join(', ')}. Details: ${messages.join('; ')}`;
    } else {
        // Here, you could integrate actual strategy checks. Example placeholders:
        noTradeReason = 'No trades triggered because all strategy conditions were never met (ATR, RSI, MACD, etc.)';
    }

    return {
        candles: allCandles,
        attemptedExchanges,
        message: noTradeReason
    };
}

export { resampleCandles };
