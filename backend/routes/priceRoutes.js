// backend/routes/priceRoutes.js
import express from "express";
import { fetchPrices, fetchPriceHistory } from "../controllers/priceController.js";

const router = express.Router();

// Live prices
router.get("/prices", fetchPrices);

// Historical prices
router.get("/prices/history", fetchPriceHistory);

export default router;
