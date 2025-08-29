// backend/routes/priceRoutes.js
import express from "express";
import { fetchLivePrices, fetchPriceHistory } from "../controllers/priceController.js";

const router = express.Router();

// GET /api/prices?symbols=BTCUSDT,ETHUSDT
router.get("/", fetchLivePrices);

// GET /api/prices/history?symbol=BTCUSDT&limit=50
router.get("/history", fetchPriceHistory);

export default router;
