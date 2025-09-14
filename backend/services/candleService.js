import ccxt from "ccxt";

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // Cache for 1 minute

async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
    console.log(`[CandleService] Attempting to fetch ${symbol} on ${exchange.id}`);
    try {
        const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, 200);
        if (candles && candles.length > 0) {
            console.log(`[CandleService] Successfully fetched ${candles.length} candles for ${symbol}`);
            return candles;
        }
        console.warn(`[CandleService] Exchange returned empty data for ${symbol}.`);
        return null;
    } catch (e) {
        console.error(`[CandleService] Error fetching ${symbol} on ${exchange.id}:`, e.message);
        return null;
    }
}

export async function fetchOHLCVMultiSafe(symbol, timeframe) {
    const key = `${symbol}::${timeframe}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.value;
    }

    // --- THIS IS THE FIX ---
    // Only use US-compliant exchanges.
    const exchanges = ['coinbase', 'kraken', 'gemini'];
    
    for (const exchangeId of exchanges) {
        console.log(`[CandleService] Trying US exchange: ${exchangeId}`);
        const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000 });

        // Try different US symbol formats, e.g., 'BTC/USD', 'BTC-USD'
        const symbolFormats = [
            symbol.includes('/') ? symbol : `${symbol.slice(0, -3)}/${symbol.slice(-3)}`,
            symbol.replace('/', '-')
        ];

        for (const format of symbolFormats) {
            const candles = await fetchCandlesWithRetry(exchange, format, timeframe);
            if (candles) {
                const result = { candles };
                cache.set(key, { ts: Date.now(), value: result });
                return result;
            }
        }
    }

    throw new Error(`Failed to fetch candle data for ${symbol} from all available US exchanges.`);
}
