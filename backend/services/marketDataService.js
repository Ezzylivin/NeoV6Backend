// File: backend/services/marketDataService.js
import axios from "axios";

/**
 * Convert timeframe like "1m", "1h" → seconds
 */
export const timeframeToSeconds = (tf) => {
  const map = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400
  };
  return map[tf] || 60;
};

/**
 * Fetch OHLCV candles from supported U.S. exchanges
 */
export const fetchOHLCV = async (exchange, symbol, timeframe = "1h", limit = 200, startDate, endDate) => {
  switch (exchange) {
    case "coinbase": {
      // Coinbase API expects BTC-USD format
      const formatted = symbol.replace("/", "-");
      const granularity = timeframeToSeconds(timeframe);

      const url = `https://api.exchange.coinbase.com/products/${formatted}/candles?granularity=${granularity}&limit=${limit}`;
      const res = await axios.get(url);

      // Coinbase returns [time, low, high, open, close, volume]
      return res.data.map(c => [
        +c[0] * 1000,
        +c[3], // open
        +c[2], // high
        +c[1], // low
        +c[4], // close
        +c[5]  // volume
      ]).reverse();
    }

    case "kraken": {
      // Kraken API requires mapping: BTC/USD -> XXBTZUSD
      const mapSymbol = (s) => {
        if (s === "BTC/USD") return "XXBTZUSD";
        if (s === "ETH/USD") return "XETHZUSD";
        return s.replace("/", "");
      };

      const pair = mapSymbol(symbol);
      const interval = timeframe.replace("m", "").replace("h", "0").replace("d", "1440");

      const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}&since=${Math.floor(Date.now() / 1000) - limit * timeframeToSeconds(timeframe)}`;
      const res = await axios.get(url);
      const data = res.data.result[pair] || [];

      return data.map(c => [
        +c[0] * 1000,
        +c[1], +c[2], +c[3], +c[4], +c[6]
      ]);
    }

    case "gemini": {
      // Gemini API expects BTCUSD format
      const formatted = symbol.replace("/", "");
      const ms = timeframeToSeconds(timeframe) * 1000;

      const end = endDate ? new Date(endDate).getTime() : Date.now();
      const start = startDate ? new Date(startDate).getTime() : end - limit * ms;

      const url = `https://api.gemini.com/v2/candles/${formatted}/${timeframe}`;
      const res = await axios.get(url);

      return res.data
        .filter(c => c[0] >= start && c[0] <= end)
        .map(c => [
          +c[0], +c[1], +c[2], +c[3], +c[4], +c[5]
        ])
        .reverse();
    }

    default:
      throw new Error(`Exchange ${exchange} not supported`);
  }
};
