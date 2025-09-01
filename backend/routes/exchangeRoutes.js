// File: src/backend/routes/exchangeRoutes.js
import express from "express";
import * as exchangeController from "../controllers/exchangeController.js";
import * as candleController from "../controllers/candleController.js";

const router = express.Router();

// Get available US-based exchanges + symbols
router.get("/exchanges", exchangeController.getExchanges);

// Get candles
router.get("/candles", candleController.getCandles);

export default router;
