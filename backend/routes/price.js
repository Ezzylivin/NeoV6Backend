// backend/routes/priceRoutes.js
import express from "express";
import { getLivePrices } from "../controllers/priceController.js";

const router = express.Router();
router.get("/prices", getLivePrices);

export default router;
