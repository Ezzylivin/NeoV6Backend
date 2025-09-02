// File: src/backend/routes/strategyRoutes.js
import express from "express";
import {
  getUserStrategies,
  getStrategyById,
  upsertStrategy,
  deleteStrategy,
} from "../controllers/strategyController.js";

const router = express.Router();

// --- Get all strategies for a user ---
router.get("/:userId", getUserStrategies);

// --- Get a single strategy by ID ---
router.get("/id/:id", getStrategyById);

// --- Create or update (upsert) a strategy ---
router.post("/", upsertStrategy);

// --- Delete a strategy ---
router.delete("/:userId/:name", deleteStrategy);

export default router;
