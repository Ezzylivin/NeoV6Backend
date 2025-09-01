// File: src/backend/routes/candleRoutes.js
import express from "express";
import { getCandles } from "../controllers/candleController.js";

const router = express.Router();

// GET /api/candles?exchange=coinbase&symbol=BTC/USD&timeframe=1h
router.get("/", getCandles);

export default router;
