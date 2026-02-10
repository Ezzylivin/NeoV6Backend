// File: src/backend/routes/marketRoutes.js
import express from "express";
import { getCandlesController, getPriceController } from "../controllers/marketController.js";

const router = express.Router();

router.get("/candles", getCandlesController);
router.get("/price", getPriceController);

export default router;
