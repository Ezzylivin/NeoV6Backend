import ccxt from "ccxt";

// List of US-based exchanges according to CCXT docs
const US_EXCHANGES = [
  "coinbase",
  "coinbasepro", // some still use pro for legacy
  "kraken",
  "gemini"
];

// Controller
export const getCandles = async (req, res) => {
  try {
    const { exchange, symbol, timeframe = "1m" } = req.query;

    if (!exchange || !symbol) {
      return res.status(400).json({ error: "Exchange and symbol are required" });
    }

    if (!US_EXCHANGES.includes(exchange)) {
      return res.status(400).json({
        error: `Exchange '${exchange}' is not supported. Supported: ${US_EXCHANGES.join(", ")}`
      });
    }

    const ex = new ccxt[exchange]();

    if (!ex.has["fetchOHLCV"]) {
      return res.status(400).json({ error: `${exchange} does not support OHLCV` });
    }

    // Load markets for validation
    await ex.loadMarkets();

    if (!ex.symbols.includes(symbol)) {
      return res.status(400).json({ error: `Symbol ${symbol} not available on ${exchange}` });
    }

    const since = ex.milliseconds() - 1000 * 60 * 60; // last 1h
    const candles = await ex.fetchOHLCV(symbol, timeframe, since);

    const formatted = candles.map(([time, open, high, low, close]) => ({
      time: Math.floor(time / 1000), // lightweight-charts expects UNIX seconds
      open,
      high,
      low,
      close,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Error fetching candles:", err);
    res.status(500).json({ error: "Failed to fetch candles" });
  }
};
