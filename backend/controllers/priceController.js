// File: backend/controllers/priceController.js
import PriceService from '../services/priceService.js';
import PriceModel from '../dbStructure/price.js'; // for historical prices

// ✅ Fetch live prices (from PriceService memory cache)
export const fetchPrices = (req, res) => {
  try {
    const symbols = req.query.symbols?.split(',') || ['BTCUSDT', 'ETHUSDT'];
    const prices = PriceService.getPrices(symbols); // uses cached prices
    res.json({ success: true, prices });
  } catch (err) {
    console.error('[PriceController] Error fetching live prices:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Fetch historical prices (from MongoDB)
export const fetchPriceHistory = async (req, res) => {
  try {
    const { symbol, limit = 100 } = req.query;
    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Symbol is required' });
    }

    const history = await PriceModel.find({ symbol })
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    res.json({ success: true, history });
  } catch (err) {
    console.error('[PriceController] Error fetching price history:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
