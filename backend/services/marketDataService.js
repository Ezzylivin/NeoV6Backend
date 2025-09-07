// File: backend/services/marketDataService.js
import axios from "axios";

/**
 * Fetch OHLCV from a single exchange
 * Should return array of [timestamp, open, high, low, close, volume]
 */export async function fetchOHLCV(exchange, symbol, timeframe = "1h", limit = 2000) {
  switch (exchange.toLowerCase()) {
    case "binance": {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
      const res = await axios.get(url);
      return res.data.map(c => [
        c[0], +c[1], +c[2], +c[3], +c[4], +c[5] // [time, O, H, L, C, V]
      ]);
    }
    case "kraken": {
      const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=${timeframeToKraken(timeframe)}&since=0`;
      const res = await axios.get(url);
      const pair = Object.keys(res.data.result).find(k => k !== "last");
      return res.data.result[pair].slice(-limit).map(c => [
        +c[0] * 1000, +c[1], +c[2], +c[3], +c[4], +c[6]
      ]);
    }
    case "coinbase": {
      const url = `https://api.pro.coinbase.com/products/${symbol}/candles?granularity=${timeframeToSeconds(timeframe)}&limit=${limit}`;
      const res = await axios.get(url);
      return res.data.map(c => [
        +c[0] * 1000, +c[3], +c[2], +c[1], +c[4], +c[5]
      ]);
    }
    case "gemini": {
      const url = `https://api.gemini.com/v2/candles/${symbol}/${timeframeToSeconds(timeframe)}?limit=${limit}`;
      const res = await axios.get(url);
      return res.data.map(c => [
        +c.timestamp * 1000, +c.open, +c.high, +c.low, +c.close, +c.volume
      ]);
    }
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}


// Helpers to convert timeframe
function timeframeToSeconds(tf) {
  const map = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400 };
  return map[tf] || 3600;
}

function timeframeToKraken(tf) {
  const map = { "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440 };
  return map[tf] || 60;
}
