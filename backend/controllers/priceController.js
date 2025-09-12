// File: src/backend/controllers/priceController.js
import * as priceService from "../services/priceService.js";

// === GET live prices for symbols ===
export const getLivePrices = async (req, res) => {
  try {
    const { symbols } = req.query; // e.g. ?symbols=BTCUSDT,ETHUSDT
    if (!symbols) {
      return res.status(400).json({ message: "Symbols are required (comma-separated)" });
    }
    const list = symbols.split(",");
    const prices = await priceService.fetchLivePrices(list);
    res.json(prices);
  } catch (err) {
    console.error("[getLivePrices]", err.message);
    res.status(500).json({ message: "Error fetching live prices", error: err.message });
  }
};

// === GET price history for a symbol ===
export const getPriceHistory = async (req, res) => {
  try {
    const { symbol, period, interval } = req.query;
    if (!symbol) {
      return res.status(400).json({ message: "Symbol is required" });
    }

    // default: 24h period, 60s interval
    const periodHours = period ? parseInt(period) : 24;
    const intervalSec = interval ? parseInt(interval) : 60;

    const history = await priceService.fetchPriceHistory(symbol, periodHours, intervalSec);
    res.json(history);
  } catch (err) {
    console.error("[getPriceHistory]", err.message);
    res.status(500).json({ message: "Error fetching price history", error: err.message });
  }
};

// === POST save latest price for a symbol ===
export const savePrice = async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ message: "Symbol is required" });
    }

    const price = await priceService.savePrice(symbol);
    res.json(price);
  } catch (err) {
    console.error("[savePrice]", err.message);
    res.status(500).json({ message: "Error saving price", error: err.message });
  }
};

// === Start background feed (server only) ===
export const startPriceFeed = () => {
  const defaultSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
  priceService.startPriceFeed(defaultSymbols, 10000);
};
