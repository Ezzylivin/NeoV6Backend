import express from "express";
import {
  createStrategy,
  getStrategies,
  getStrategyByCode, // Assuming a new controller for a single strategy
  deleteStrategy
} from "../controllers/strategyController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Corrected routes
router.post("/", protect, createStrategy);         // POST for creating a strategy
router.get("/", protect, getStrategies);       // GET for retrieving all user's strategies
router.get("/:id", protect, getStrategyByCode);       // GET for retrieving a single strategy by ID (new)
router.delete("/:id", protect, deleteStrategy);     // DELETE for deleting a strategy by ID

export default router;
