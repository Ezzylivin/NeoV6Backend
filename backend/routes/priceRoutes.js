// File: src/backend/routes/priceRoutes.js
import express from "express";
import { getLivePrices, getPriceHistory, savePrice } from "../controllers/priceController.js";

const router = express.Router();

router.get("/live", getLivePrices);      // /api/prices/live?symbols=BTCUSDT,ETHUSDT
router.get("/history", getPriceHistory); // /api/prices/history?symbol=BTCUSDT&period=24&interval=60
router.post("/save", savePrice);         // { "symbol": "BTCUSDT" }

export default router;
