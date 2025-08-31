import PriceService from "../services/priceService.js";

// --- Live prices endpoint ---
export const fetchPrices = (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",") || ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
    const prices = PriceService.getPrices(symbols);
    res.json({ success: true, prices });
  } catch (err) {
    console.error("[PriceController] Error fetching live prices:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Historical prices endpoint ---
export const fetchPriceHistory = async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",") || ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
    const period = parseInt(req.query.period) || 24; // default 24h
    const interval = parseInt(req.query.interval) || 60; 
    // interval in seconds → default 60s (downsample to 1 point/min)

    const result = {};
    for (const symbol of symbols) {
      result[symbol] = await PriceService.getHistory(symbol, period, interval);
    }

    res.json({ success: true, history: result });
  } catch (err) {
    console.error("[PriceController] Error fetching price history:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
