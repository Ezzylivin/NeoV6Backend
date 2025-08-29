// backend/controllers/priceController.js
import Price from "../dbStructure/price.js";
import { getPrices } from "../services/priceService.js";

// ✅ Live prices (from WebSocket memory)
export const fetchLivePrices = (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",") || ["BTCUSDT", "ETHUSDT"];
    const prices = getPrices(symbols);
    res.json({ success: true, prices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✅ Historical prices (from DB)
export const fetchPriceHistory = async (req, res) => {
  try {
    const { symbol, limit = 100 } = req.query;
    if (!symbol) {
      return res.status(400).json({ success: false, error: "Symbol is required" });
    }

    const history = await Price.find({ symbol })
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
