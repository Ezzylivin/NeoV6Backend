// File: backend/routes/priceRoutes.js
import express from "express";
import Price from "../services/priceService.js";
import Price from "../dbStructure/price.js";

const router = express.Router();

// Live prices
router.get('/prices', (req, res) => {
  const symbols = req.query.symbols?.split(',') || ['BTCUSDT', 'ETHUSDT'];
  const prices = Price.getPrices(symbols);
  res.json({ success: true, prices });
});

// Historical prices
router.get("/prices/history", async (req, res) => {
  try {
    const { symbol, limit = 100 } = req.query;
    if (!symbol) return res.status(400).json({ success: false, message: "symbol is required" });

    const history = await Price.find({ symbol })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
