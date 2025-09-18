// File: backend/services/backtestDataService.js
import ccxt from 'ccxt';
import axios from 'axios';
import Cache from '../dbStructure/cache.js'; // Import the new cache model

const US_EXCHANGES = ['coinbase', 'kraken', 'binanceus'];
const CANDLE_LIMIT = 400;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

async function fetchCandles(exchangeId, symbol, timeframe) {
    try {
        const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
        if (!exchange.has.fetchOHLCV) return null;
        const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
        return candles;
    } catch (err) {
        return null;
    }
}

// UPGRADED: Now with persistent caching to prevent rate-limiting issues
export async function getBacktestOptionsData() {
    const cacheKey = 'backtestOptions';
    const cachedEntry = await Cache.findOne({ key: cacheKey });
    
    if (cachedEntry) {
        console.log("Serving backtest options from persistent cache.");
        return cachedEntry.data;
    }
  
    const cryptoApiUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1';
    try {
        const response = await axios.get(cryptoApiUrl);
        const top10Cryptos = response.data.map(coin => ({ 
            id: coin.id,
            symbol: coin.symbol.toUpperCase() + '/USD'
        }));
        const symbols = top10Cryptos.map(crypto => crypto.symbol);
        const timeframes = ['1m','5m','15m','30m','1h','4h','1d'];
        const newOptions = { symbols, timeframes };

        // Save the new options to the database cache
        const expiresAt = new Date(Date.now() + CACHE_DURATION);
        await Cache.create({ key: cacheKey, data: newOptions, expiresAt });

        return newOptions;
    } catch (err) {
        console.error("❌ Failed to fetch backtest options:", err);
        // Fallback to a default list if the API call fails
        return {
            symbols: ['BTC/USD', 'ETH/USD', 'ADA/USD', 'XRP/USD', 'DOGE/USD'],
            timeframes: ['1m','5m','15m','30m','1h','4h','1d'],
        };
    }
}

export async function fetchOHLCVMultiSafe(symbol, timeframe) {
    console.log(`[Data Service] Fetching ${symbol} ${timeframe} candles...`);
    for (const exchangeId of US_EXCHANGES) {
        const candles = await fetchCandles(exchangeId, symbol, timeframe);
        if (candles && candles.length > 0) {
            console.log(`✅ Found data for ${symbol} on ${exchangeId}.`);
            return { candles, exchange: exchangeId };
        }
    }
    throw new Error(`Failed to fetch candle data for ${symbol} from all available exchanges.`);
}
