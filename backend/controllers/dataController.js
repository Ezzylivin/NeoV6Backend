// File: backend/controllers/dataController.js
import ccxt from 'ccxt';

const EXCHANGES = ['coinbase'];
const CANDLE_LIMIT = 2000;

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
export const getBacktestOptions = async (req, res) => {
    try {
        const exchangeId = 'coinbasepro';
        const exchange = new ccxt[exchangeId]();
        
        await exchange.loadMarkets();

        // Dynamically get all symbols from the exchange that are against a common quote currency
        const symbols = Object.values(exchange.markets)
            .filter(market => market.active && market.quote === 'USDT' || market.quote === 'USD')
            .map(market => market.symbol)
            .slice(0, 50); // Limit to the top 50 for performance

        // These are the common timeframes supported by most exchanges
        const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];

        return res.status(200).json({
            success: true,
            message: "Backtest options fetched successfully",
            data: {
                symbols,
                timeframes
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch backtest options from exchange." });
    }
};

// Fetches candlestick data from multiple exchanges.
export const fetchOHLCVMultiSafe = async (symbol, timeframe) => {
    for (const exchangeId of EXCHANGES) {
        const candles = await fetchCandles(exchangeId, symbol, timeframe);
        if (candles) {
            return { candles };
        }
    }
    throw new Error(`Failed to fetch candle data for ${symbol} from all available exchanges.`);
};
