import express from "express";
import {
  getBacktestOptions,
  getLivePrices,
  getCandles,
  getPriceHistory
} from "../controllers/dataController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/backtest/options", protect, getBacktestOptions);
router.get("/prices", protect, getLivePrices);
router.get("/candles", protect, getCandles);
router.get("/history", protect, getPriceHistory);

export default router;
