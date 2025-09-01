// File: src/backend/routes/exchangeRoutes.js
import express from "express";
import { getExchanges } from "../controllers/exchangeController.js";
import { getCandles } from "../controllers/candleController.js"; // keep your existing candle route

const router = express.Router();

// GET /api/exchanges → returns DB + live CCXT USD symbols
router.get("/", getExchanges);

// GET /api/exchanges/candles → returns candles (keep as is)
router.get("/candles", getCandles);

export default router;
