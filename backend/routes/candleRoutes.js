import express from "express";
import * as candleController from "../controllers/candleController.js";

const router = express.Router();

// GET: /api/candles?exchange=coinbase&symbol=BTC/USD&timeframe=1m
router.get("/", candleController.getCandles);

export default router;
