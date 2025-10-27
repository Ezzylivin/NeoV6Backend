import express from "express";
import {
  getBacktestOptions,
  getLivePrices,
  getCandles,
  getPriceHistory
} from "../controllers/dataController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/options", protect, getBacktestOptions);
router.get("/live-prices", protect, getLivePrices);
router.get("/candles", protect, getCandles);
router.get("/price-history", protect, getPriceHistory);

export default router;
