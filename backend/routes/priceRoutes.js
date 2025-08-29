// File: backend/routes/priceRoutes.js
import express from "express";
import { getPrices } from "../services/priceService.js";

const router = express.Router();

/**
 * GET /api/prices
 * Query: ?symbols=BTCUSDT,ETHUSDT,BNBUSDT
 * Returns latest prices for requested symbols
 */
router.get("/prices", (req, res) => {
  const symbolsQuery = req.query.symbols || "BTCUSDT,ETHUSDT";
  const symbols = symbolsQuery.split(",").map((s) => s.trim().toUpperCase());

  const prices = getPrices(symbols);
  res.json({ success: true, prices });
});

export default router;
