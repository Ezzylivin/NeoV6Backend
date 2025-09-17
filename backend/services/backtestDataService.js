// File: backend/services/backtestDataService.js
// UPGRADED: Fetches all data from live crypto exchanges, removing dependency on local files.

import ccxt from 'ccxt';

// A prioritized list of US-regulated exchanges to query for data
const US_EXCHANGES = ['coinbase', 'kraken', 'binanceus'];
const CANDLE_LIMIT = 200; // The number of candles to fetch per request

/**
 * A helper function to fetch OHLCV (candlestick) data from a single exchange.
 * Includes error handling for unsupported symbols or network issues.
 * @param {string} exchangeId - The ID of the exchange (e.g., 'coinbase').
 * @param {string} symbol - The trading pair (e.g., 'BTC/USD').
 * @param {string} timeframe - The candle timeframe (e.g., '1d', '4h').
 * @returns {Promise<Array|null>} A promise that resolves to the candle data or null.
 */
async function fetchCandles(exchangeId, symbol, timeframe) {
  try {
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
    if (!exchange.has.fetchOHLCV) {
      console.warn(`[${exchangeId}] does not support OHLCV fetching.`);
      return null;
    }

    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    return candles;
  } catch (err) {
    // This is a common, expected error if an exchange doesn't carry a specific pair.
    // console.error(`Error fetching OHLCV from ${exchangeId} for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Fetches the available symbols and timeframes for the frontend dropdowns.
 * It queries multiple exchanges to build a comprehensive list.
 * @returns {Promise<object>} An object containing arrays of symbols and timeframes.
 */
export async function getBacktestOptionsData() {
  try {
    const symbolsSet = new Set();

    for (const exchangeId of US_EXCHANGES) {
      const exchange = new ccxt[exchangeId]();
      await exchange.loadMarkets();

      Object.values(exchange.markets)
        .filter(market => market.active && (market.quote === 'USD' || market.quote === 'USDT'))
        .forEach(market => symbolsSet.add(market.symbol));
    }

    const symbols = Array.from(symbolsSet).sort().slice(0, 100); // Provide top 100 symbols
    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

    return { symbols, timeframes };
  } catch (err) {
    console.error("❌ Failed to fetch backtest options from exchanges:", err);
    throw new Error("Could not fetch backtest options from exchanges.");
  }
}

/**
 * The main data function for the backtester. It tries to fetch candle data
 * from the list of exchanges in order, returning the first successful result.
 * @param {string} symbol - The trading pair (e.g., 'BTC/USD').
 * @param {string} timeframe - The candle timeframe (e.g., '1d').
 * @returns {Promise<object>} An object containing the candle data and the source exchange.
 */
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
