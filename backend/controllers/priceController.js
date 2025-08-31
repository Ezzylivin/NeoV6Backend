import PriceService from "../services/priceService.js";

// --- Live prices endpoint ---
export const fetchPrices = (req, res) => {
  try {
    const symbols = req.query.symbols?.split(',') || ['BTCUSDT','ETHUSDT','BNBUSDT'];
    const prices = PriceService.getPrices(symbols);
    res.json({ success: true, prices });
  } catch (err) {
    console.error('[PriceController] Error fetching live prices:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Historical prices endpoint ---
export const fetchPriceHistory = async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(',') || ['BTCUSDT','ETHUSDT','BNBUSDT'];
    const result = {};
    for (const symbol of symbols) {
      const history = await PriceService.getHistory(symbol, 24); // last 24 hours
      result[symbol] = history;
    }
    res.json({ success: true, history: result });
  } catch (err) {
    console.error('[PriceController] Error fetching price history:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
