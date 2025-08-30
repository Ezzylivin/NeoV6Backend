// File: backend/controllers/priceController.js
import Price from '../dbStructure/price.js';        // for historical DB prices
import PriceService from '../services/priceService.js'; // for live memory prices

/**
 * GET /api/prices/live?symbols=BTCUSDT,ETHUSDT
 * Returns live prices from memory (updated via PriceService)
 */
export const fetchLivePrices = (req, res) => {
  try {
    const symbols = req.query.symbols?.split(',') || ['BTCUSDT', 'ETHUSDT'];
    const prices = PriceService.getLivePrices(symbols);
    res.json({ success: true, prices });
  } catch (err) {
    console.error('[PriceController] Error fetching live prices:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/prices/history?symbol=BTCUSDT&limit=100
 * Returns historical prices from MongoDB
 */
export const fetchPriceHistory = async (req, res) => {
  try {
    const { symbol, limit = 100 } = req.query;
    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Symbol is required' });
    }

    const history = await Price.find({ symbol })
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    res.json({ success: true, history });
  } catch (err) {
    console.error('[PriceController] Error fetching price history:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
