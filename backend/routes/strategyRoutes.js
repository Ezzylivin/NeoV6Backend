import express from "express";
import {
  createStrategy,
  updateStrategy,
  getUserStrategies,
  getStrategyByCode, // Assuming a new controller for a single strategy
  deleteStrategy
} from "../controllers/strategyController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Corrected routes
router.post("/", protect, createStrategy);         // POST for creating a strategy
router.get("/", protect, getUserStrategies);       // GET for retrieving all user's strategies
router.get("/:id", protect, getStrategyByCode);       // GET for retrieving a single strategy by ID (new)
router.put("/:id", protect, updateStrategy);       // PUT for updating a strategy by ID
router.delete("/:id", protect, deleteStrategy);     // DELETE for deleting a strategy by ID

export default router;
