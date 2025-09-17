// Fetch live crypto data from US-regulated exchanges

import ccxt from 'ccxt';

const US_EXCHANGES = ['coinbase', 'kraken', 'binanceus'];
const CANDLE_LIMIT = 200;

async function fetchCandles(exchangeId, symbol, timeframe) {
  try {
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
    if (!exchange.has.fetchOHLCV) return null;
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, CANDLE_LIMIT);
    return candles;
  } catch (err) {
    return null; // expected if pair not available
  }
}

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

    const symbols = Array.from(symbolsSet).sort().slice(0, 100);
    const timeframes = ['1m','5m','15m','30m','1h','4h','1d'];

    return { symbols, timeframes };
  } catch (err) {
    console.error("❌ Failed to fetch backtest options:", err);
    throw new Error("Could not fetch backtest options from exchanges.");
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
