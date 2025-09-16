// File: backend/controllers/dataController.js
import ccxt from 'ccxt';

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

// Helper to fetch live ticker data from a single exchange
async function fetchLiveTickers(exchangeId, symbols) {
    try {
        const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
        const tickers = await exchange.fetchTickers(symbols);
        return tickers;
    } catch (e) {
        console.error(`Error fetching live tickers from ${exchangeId}: ${e.message}`);
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
            .filter(market => market.active && (market.quote === 'USDT' || market.quote === 'USD'))
            .map(market => market.symbol)
            .slice(0, 50); // Limit to the top 50 for performance

        // These are the common timeframes supported by most exchanges
        const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];

        return { symbols, timeframes };
    } catch (error) {
        console.error("Failed to fetch backtest options from exchange:", error);
        throw new Error("Failed to fetch backtest options from exchange.");
    }
};

// NEW: Fetches live prices for a set of symbols
export const getLivePrices = async (req, res) => {
    const { symbols } = req.query;
    if (!symbols) {
        return res.status(400).json({ success: false, message: "Symbols parameter is required." });
    }
    
    const symbolsList = symbols.split(',');

    try {
        const tickers = await fetchLiveTickers('coinbasepro', symbolsList);
        if (tickers) {
            return res.status(200).json({ success: true, data: tickers });
        } else {
            return res.status(500).json({ success: false, message: "Failed to retrieve live prices." });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Fetches candlestick data from multiple exchanges.
export const getCandles = async (req, res) => {
    const { symbol, timeframe } = req.query;
    if (!symbol || !timeframe) {
        return res.status(400).json({ success: false, message: "Symbol and timeframe are required." });
    }
    try {
        const candles = await fetchCandles('coinbasepro', symbol, timeframe);
        if (candles) {
             return res.status(200).json({ success: true, data: { candles } });
        } else {
             return res.status(500).json({ success: false, message: `Failed to retrieve candles for ${symbol}.` });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// This is the function that your backtestService.js needs.
export const fetchOHLCVMultiSafe = async (symbol, timeframe) => {
    for (const exchangeId of EXCHANGES) {
        const candles = await fetchCandles(exchangeId, symbol, timeframe);
        if (candles) {
            return { candles };
        }
    }
    throw new Error(`Failed to fetch candle data for ${symbol} from all available exchanges.`);
};

// This is a placeholder for your price history logic.
export const getPriceHistory = async (req, res) => {
    res.status(200).json({ success: true, message: "Price history not yet implemented." });
};
