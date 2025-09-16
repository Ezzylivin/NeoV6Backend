// File: backend/services/backtestDataService.js
import ccxt from 'ccxt';
import axios from 'axios';

const EXCHANGES = ['coinbasepro'];
const CANDLE_LIMIT = 200;

// Helper to fetch data from a single exchange
async function fetchCandles(exchangeId, symbol, timeframe) {
    try {
        const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
        const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
        return candles;
    } catch (e) {
        console.error(`Error fetching from ${exchangeId}: ${e.message}`);
        return null;
    }
}

// Fetches a list of valid symbols and timeframes directly from a trusted exchange.
export async function getBacktestOptionsData() {
    try {
        const exchangeId = 'coinbasepro';
        const exchange = new ccxt[exchangeId]();
        
        await exchange.loadMarkets();

        const symbols = Object.values(exchange.markets)
            .filter(market => market.active && (market.quote === 'USDT' || market.quote === 'USD'))
            .map(market => market.symbol)
            .slice(0, 50);

        const timeframes = ['1m', '5m', '30m', '15m', '1h', '4h', '1d'];

        return { symbols, timeframes };
    } catch (error) {
        console.error("Failed to fetch backtest options from exchange:", error);
        throw new Error("Failed to fetch backtest options from exchange.");
    }
}

// Fetches candlestick data from multiple exchanges.
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
    for (const exchangeId of EXCHANGES) {
        const candles = await fetchCandles(exchangeId, symbol, timeframe);
        if (candles) {
            return { candles };
        }
    }
    throw new Error(`Failed to fetch candle data for ${symbol} from all available exchanges.`);
}
