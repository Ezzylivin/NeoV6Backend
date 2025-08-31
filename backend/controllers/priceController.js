// File: backend/controllers/priceController.js
import PriceService from '../services/priceService.js';
import PriceModel from '../dbStructure/price.js';

// --- GET /api/prices/live?symbols=BTCUSDT,ETHUSDT ---
export const getLivePrices = async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(',') || ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
    const prices = {};

    for (const symbol of symbols) {
      try {
        // Use PriceService memory cache or fetch latest
        const price = await PriceService.fetchPrice(symbol);
        prices[symbol] = price;
      } catch (err) {
        console.error(`[PriceController] Failed to fetch ${symbol}:`, err.message);
        prices[symbol] = null;
      }
    }

    res.json({ success: true, prices });
  } catch (err) {
    console.error('[PriceController] getLivePrices error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- GET /api/prices/history?symbols=BTCUSDT,ETHUSDT ---
export const getPriceHistory = async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(',') || ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
    const result = {};
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

    for (const symbol of symbols) {
      const history = await PriceModel.find({ symbol, timestamp: { $gte: since } }).sort({ timestamp: 1 });

      // Aggregate into 5-minute buckets
      const bucketMap = {};
      history.forEach((point) => {
        const date = new Date(point.timestamp);
        const minutes = Math.floor(date.getMinutes() / 5) * 5;
        const bucketKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), minutes).toISOString();

        if (!bucketMap[bucketKey]) bucketMap[bucketKey] = [];
        bucketMap[bucketKey].push(point.price);
      });

      result[symbol] = Object.entries(bucketMap).map(([time, prices]) => ({
        time,
        price: prices.reduce((a, b) => a + b, 0) / prices.length,
      }));
    }

    res.json({ success: true, history: result });
  } catch (err) {
    console.error('[PriceController] getPriceHistory error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
