// File: src/backend/controllers/priceController.js
import * as priceService from "../services/priceService.js";

export const getLivePrices = async (req, res) => {
  try {
    const symbols = req.query.symbols.split(",");
    const prices = await priceService.fetchLivePrices(symbols);
    res.json({ success: true, prices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getPriceHistory = async (req, res) => {
  try {
    const { symbols, period, interval } = req.query;
    const history = await priceService.fetchPriceHistory(symbols, period, interval);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
