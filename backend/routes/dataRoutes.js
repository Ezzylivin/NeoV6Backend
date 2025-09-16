// File: backend/routes/dataRoutes.js
import express from "express";
import {
  getBacktestOptions,
  getLivePrices,
  getCandles,
  getPriceHistory,
} from "../controllers/dataController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Secure all routes
router.get("/options", authMiddleware, getBacktestOptions);
router.get("/live-prices", authMiddleware, getLivePrices);
router.get("/candles", authMiddleware, getCandles);
router.get("/price-history", authMiddleware, getPriceHistory);

export default router;
