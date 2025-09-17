// File: backend/services/backtestDataService.js
// Fetch live crypto data from US-regulated exchanges

import ccxt from 'ccxt';
import axios from 'axios'; // We need axios for the external API call

const US_EXCHANGES = ['coinbase', 'kraken', 'binanceus'];
const CANDLE_LIMIT = 500;

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

// UPGRADED: Now returns the top 10 cryptos by market cap
export async function getBacktestOptionsData() {
  const cryptoApiUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1';

  try {
    const response = await axios.get(cryptoApiUrl);
    const top10Cryptos = response.data.map(coin => ({ 
        id: coin.id,
        symbol: coin.symbol.toUpperCase() + '/USD' // Format symbol for ccxt
    }));
    const symbols = top10Cryptos.map(crypto => crypto.symbol);
    const timeframes = ['1m','5m','15m','30m','1h','4h','1d'];

    return { symbols, timeframes };
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
