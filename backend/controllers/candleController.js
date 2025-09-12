// File: src/backend/controllers/candleController.js
import ccxt from "ccxt";

const SUPPORTED_INTERVALS = ["1m","5m","10m","15m","30m","1h","4h","1d"];
// Only US-based exchanges
const US_EXCHANGES = ["coinbase", "gemini", "kraken"];

const fetchCandlesFromExchange = async (exchangeName, symbol, timeframe) => {
  try {
    const ex = new ccxt[exchangeName]();
    await ex.loadMarkets();

    if (!SUPPORTED_INTERVALS.includes(timeframe)) timeframe = "1h";

    const ohlcv = await ex.fetchOHLCV(symbol, timeframe);
    return ohlcv.map(c => ({
      time: Math.floor(c[0]/1000),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));
  } catch (err) {
    console.warn(`[Candles Error] ${exchangeName} ${symbol}:`, err.message);
    return null;
  }
};

export const getCandles = async (req, res) => {
  const { exchange: exchangeName = "coinbase", symbol = "BTC/USD", timeframe = "1h" } = req.query;

  // Skip non-US exchanges
  if (!US_EXCHANGES.includes(exchangeName.toLowerCase())) {
    return res.status(400).json({ error: "Only US-based exchanges are supported" });
  }

  let candles = await fetchCandlesFromExchange(exchangeName, symbol, timeframe);

  if (!candles || !candles.length) {
    return res.status(500).json({ error: "No data available from the selected exchange" });
  }

  res.json(candles);
};
