// File: backend/controllers/priceController.js
import PriceService from '../services/priceService.js';
import Price from '../dbStructure/price.js'; // For historical prices

// ✅ Live prices from memory
export const fetchLivePrices = (req, res) => {
  try {
    const symbols = req.query.symbols?.split(',') || ['BTCUSDT', 'ETHUSDT'];
    const prices = PriceService.getPrices(symbols);
    res.json({ success: true, prices });
  } catch (err) {
    console.error('[PriceController] Error fetching live prices:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✅ Historical prices from DB
export const fetchPriceHistory = async (req, res) => {
  try {
    const { symbol, limit = 100 } = req.query;
    if (!symbol) return res.status(400).json({ success: false, error: 'Symbol is required' });

    const history = await Price.find({ symbol })
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    res.json({ success: true, history });
  } catch (err) {
    console.error('[PriceController] Error fetching historical prices:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
