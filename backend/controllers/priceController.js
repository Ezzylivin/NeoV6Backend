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
    const { symbols } = req.query; // e.g., "BTCUSDT,ETHUSDT,BNBUSDT"
    if (!symbols) {
      return res.status(400).json({ success: false, message: 'Symbols are required' });
    }

    const symbolsArray = symbols.split(',');
    const result = {};

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const symbol of symbolsArray) {
      const history = await PriceModel.find({ symbol, timestamp: { $gte: since } })
        .sort({ timestamp: 1 }); // oldest first
      result[symbol] = history.map(h => ({
        time: h.timestamp,
        price: h.price
      }));
    }

    res.json({ success: true, history: result });
  } catch (err) {
    console.error('[PriceController] Error fetching price history:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
