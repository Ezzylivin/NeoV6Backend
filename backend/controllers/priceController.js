// backend/controllers/priceController.js
import PriceService from "../services/priceService.js";
import PriceModel from "../dbStructure/price.js";

// --- Live prices from cached memory ---
export const getLivePricesController = async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",") || ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
    const prices = PriceService.getPrices(symbols); // uses cached prices
    res.json({ success: true, prices });
  } catch (err) {
    console.error("[PriceController] Error fetching live prices:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- Historical 24h prices from MongoDB ---
export const getHistoryController = async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",") || ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
    const result = {};
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

    for (const symbol of symbols) {
      const history = await PriceModel.find({ symbol, timestamp: { $gte: since } })
        .sort({ timestamp: 1 })
        .lean();

      // Aggregate into 5-minute buckets
      const bucketMap = {};
      history.forEach((point) => {
        const date = new Date(point.timestamp);
        const minutes = Math.floor(date.getMinutes() / 5) * 5;
        const bucketKey = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          date.getHours(),
          minutes
        ).toISOString();
        if (!bucketMap[bucketKey]) bucketMap[bucketKey] = [];
        bucketMap[bucketKey].push(point.price);
      });

      // Average each bucket
      const aggregated = Object.entries(bucketMap).map(([time, prices]) => ({
        time,
        price: prices.reduce((a, b) => a + b, 0) / prices.length,
      }));

      result[symbol] = aggregated;
    }

    res.json({ success: true, history: result });
  } catch (err) {
    console.error("[PriceController] Error fetching price history:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
