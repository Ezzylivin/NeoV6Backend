// backend/controllers/priceController.js
import { getPrices } from "../services/priceService.js";

export const getLivePrices = async (req, res) => {
  try {
    const { symbols } = req.query; // comma-separated
    const list = symbols ? symbols.split(",") : ["BTCUSDT", "ETHUSDT"];
    res.json({ success: true, prices: getPrices(list) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
