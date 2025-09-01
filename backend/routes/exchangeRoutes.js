// File: src/backend/routes/exchangeRoutes.js
import express from "express";
import { getExchanges } from "../controllers/exchangeController.js";

const router = express.Router();

// GET /api/exchanges
router.get("/", getExchanges);

export default router;
