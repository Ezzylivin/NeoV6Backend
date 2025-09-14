import ccxt from "ccxt";

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // Cache for 1 minute

async function fetchCandlesWithRetry(exchange, symbol, timeframe) {
    console.log(`[CandleService] Attempting to fetch ${symbol} on ${exchange.id}`);
    try {
        const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, 200); // Fetch last 200 candles
        if (candles && candles.length > 0) {
            console.log(`[CandleService] Successfully fetched ${candles.length} candles for ${symbol}`);
            return candles;
        }
        console.warn(`[CandleService] Exchange returned empty data for ${symbol}.`);
        return null;
    } catch (e) {
        console.error(`[CandleService] Error fetching ${symbol} on ${exchange.id}:`, e.message);
        return null; // Return null to allow fallback
    }
}

export async function fetchOHLCVMultiSafe(symbol, timeframe) {
    const key = `${symbol}::${timeframe}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.value;
    }

    // List of exchanges to try in order
    const exchanges = ['binance', 'kucoin', 'gateio'];
    
    for (const exchangeId of exchanges) {
        console.log(`[CandleService] Trying exchange: ${exchangeId}`);
        const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000 }); // 30-second timeout

        // Try different symbol formats, e.g., 'BTC/USDT', 'BTCUSDT'
        const symbolFormats = [
            symbol.includes('/') ? symbol : `${symbol.slice(0, -4)}/${symbol.slice(-4)}`,
            symbol.replace('/', '')
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

    // If all exchanges and formats fail, throw an error
    throw new Error(`Failed to fetch candle data for ${symbol} from all available exchanges.`);
}
