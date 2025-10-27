// File: backend/routes/backtestSetupRoutes.js
// NEW: This router defines the API endpoints for managing saved backtest configurations.

import express from "express";
import {
  createSetup,
  getSetups,
  getSetupById,
  deleteSetup,
} from "../controllers/backtestSetupController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Define the routes for Backtest Setups ---

// POST /api/backtest-setups/ -> Create a new backtest setup
router.post("/", protect, createSetup);

// GET /api/backtest-setups/ -> Get all of the user's saved setups
router.get("/", protect, getSetups);

// GET /api/backtest-setups/:id -> Get a single setup by its ID
router.get("/:id", protect, getSetupById);

// DELETE /api/backtest-setups/:id -> Delete a setup by its ID
router.delete("/:id", protect, deleteSetup);

export default router;
