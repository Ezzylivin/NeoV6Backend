// File: src/backend/controllers/candleController.js
import ccxt from "ccxt";

export const getCandles = async (req, res) => {
  const { exchange: exchangeId, symbol, timeframe = "1m", limit = 100 } = req.query;

  if (!exchangeId || !symbol) {
    return res.status(400).json({ success: false, message: "Exchange and symbol are required" });
  }

  try {
    const ex = new ccxt[exchangeId]();
    const ohlcv = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);

    const formatted = ohlcv.map(c => ({
      time: Math.floor(c[0] / 1000),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));

    res.json(formatted);
  } catch (err) {
    console.error(`[Candles Error] ${exchangeId} ${symbol}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
