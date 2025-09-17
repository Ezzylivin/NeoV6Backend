// File: backend/services/backtestDataService.js
// UPGRADED: Fetches real crypto data from multiple US exchanges.

import ccxt from 'ccxt';

// US-regulated exchanges
const US_EXCHANGES = ['coinbase', 'kraken', 'binanceus'];
const CANDLE_LIMIT = 200;

// Helper: fetch OHLCV from a single exchange
async function fetchCandles(exchangeId, symbol, timeframe) {
  try {
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
    if (!exchange.has.fetchOHLCV) {
      console.warn(`${exchangeId} does not support OHLCV fetching.`);
      return null;
    }

    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    return candles;
  } catch (err) {
    console.error(`Error fetching OHLCV from ${exchangeId} for ${symbol}: ${err.message}`);
    return null;
  }
}

// Fetch list of symbols and timeframes from US exchanges
export async function getBacktestOptionsData() {
  try {
    let symbolsSet = new Set();

    for (const exchangeId of US_EXCHANGES) {
      const exchange = new ccxt[exchangeId]();
      await exchange.loadMarkets();

      Object.values(exchange.markets)
        .filter(market => market.active && (market.quote === 'USD' || market.quote === 'USDT'))
        .forEach(market => symbolsSet.add(market.symbol));
    }

    const symbols = Array.from(symbolsSet).sort().slice(0, 50); // Limit top 50
    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

    return { symbols, timeframes };
  } catch (err) {
    console.error("Failed to fetch backtest options from US exchanges:", err);
    throw new Error("Failed to fetch backtest options from US exchanges.");
  }
}

// Fetch OHLCV from multiple exchanges safely
export async function fetchOHLCVMultiSafe(symbol, timeframe) {
  for (const exchangeId of US_EXCHANGES) {
    const candles = await fetchCandles(exchangeId, symbol, timeframe);
    if (candles && candles.length > 0) {
      return { candles, exchange: exchangeId };
    }
  }
  throw new Error(`Failed to fetch candle data for ${symbol} from all available US exchanges.`);
}
