// File: backend/controllers/candleController.js
import ExchangeService from "../services/exchangeService.js";

export const getCandles = async (req, res) => {
  const { exchange: exchangeId, symbol, timeframe = "1m", limit = 100 } = req.query;

  try {
    // Only allow US-based exchanges
    const service = new ExchangeService(exchangeId);

    const ohlcv = await service.fetchOHLCV(symbol, timeframe, limit);

    // Map to frontend format: { time: timestamp, open, high, low, close }
    const formatted = ohlcv.map(c => ({
      time: Math.floor(c[0] / 1000), // convert ms -> seconds
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Error fetching candles:", err);
    res.status(500).json({ error: "Failed to fetch candles" });
  }
};
