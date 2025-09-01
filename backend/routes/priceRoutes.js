// File: src/backend/routes/priceRoutes.js
import express from "express";
import { getLivePrices, getPriceHistory } from "../controllers/priceController.js";

const router = express.Router();

router.get("/live", getLivePrices);
router.get("/history", getPriceHistory);

export default router;
