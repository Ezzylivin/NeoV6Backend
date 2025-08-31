import { getPrices, getHistory, getCandles } from "../services/priceService.js";

// --- Live prices ---
export const fetchPrices = (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",") || ["BTCUSDT","ETHUSDT","BNBUSDT"];
    const prices = getPrices(symbols);
    res.json({ success: true, prices });
  } catch (err) {
    console.error('[PriceController] Error fetching live prices:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Historical prices ---
export const fetchPriceHistory = async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",") || ["BTCUSDT","ETHUSDT","BNBUSDT"];
    const period = parseInt(req.query.period) || 24;
    const interval = parseInt(req.query.interval) || 60;
    const result = {};

    for (const symbol of symbols) {
      result[symbol] = await getHistory(symbol, period, interval);
    }

    res.json({ success: true, history: result });
  } catch (err) {
    console.error('[PriceController] Error fetching price history:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Candlestick data ---
export const fetchCandlesData = async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",") || ["BTCUSDT","ETHUSDT","BNBUSDT"];
    const period = parseInt(req.query.period) || 24;
    const interval = parseInt(req.query.interval) || 60;
    const result = {};

    for (const symbol of symbols) {
      result[symbol] = await getCandles(symbol, period, interval);
    }

    res.json({ success: true, candles: result });
  } catch (err) {
    console.error('[PriceController] Error fetching candlestick data:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
