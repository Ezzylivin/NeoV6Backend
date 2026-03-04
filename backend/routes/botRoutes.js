// File: backend/routes/botRoutes.js
// 🚀 UPGRADE: v2.1 - "Unified Bot Router + Reset"
// Integrates:
// 1. Live Bot Control (Start/Stop/Reset/Status)
// 2. Telemetry (Logs/Winners)
// 3. Strategy Database (Save/Load/Delete setups)

import express from "express";
import {
  startBotController,
  stopBotController,
  getBotStatusController,
  getBotLogsController,
  getBotWinnersController,
  resetBotController,
  closePositionController
} from "../controllers/botController.js";

// Import strategy controllers
import {
  createSetup,
  getSetups,
  getSetupById,
  deleteSetup
} from "../controllers/backtestSetupController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- 1. Live Bot Control ---

// POST /api/bot/start -> Starts the user's trading bot
router.post("/start", protect, startBotController);

// POST /api/bot/stop -> Stops the user's trading bot
router.post("/stop", protect, stopBotController);

// 🆕 POST /api/bot/reset -> Wipes trade history & resets balance
router.post("/reset", protect, resetBotController);

router.post("/close-position", protect, closePositionController);


// --- 2. Live Bot Data & Telemetry ---

// GET /api/bot/status -> Gets the current status and configuration
router.get("/status", protect, getBotStatusController);

// GET /api/bot/logs -> Gets the latest activity logs
router.get("/logs", protect, getBotLogsController);

// GET /api/bot/winners -> Fetches "Golden" strategies from Python
router.get("/winners", protect, getBotWinnersController);


// --- 3. Strategy Database ---
// These routes handle saving/loading strategies to MongoDB

// POST /api/bot/strategies -> Save a new strategy
router.post("/strategies", protect, createSetup);

// GET /api/bot/strategies -> List all saved strategies
router.get("/strategies", protect, getSetups);

// GET /api/bot/strategies/:id -> Get specific strategy details
router.get("/strategies/:id", protect, getSetupById);

// DELETE /api/bot/strategies/:id -> Remove a strategy
router.delete("/strategies/:id", protect, deleteSetup);

export default router;
