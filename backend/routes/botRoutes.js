// File: backend/routes/botRoutes.js
// UPGRADED: Includes the new /winners endpoint for the dropdown

import express from "express";
import {
  startBotController,
  stopBotController,
  getBotStatusController,
  getBotLogsController,
  getBotWinnersController // 🚀 ADDED: Import the new controller
} from "../controllers/botController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Bot Control Endpoints ---

// POST /api/bot/start -> Starts the user's trading bot
router.post("/start", protect, startBotController);

// POST /api/bot/stop -> Stops the user's trading bot
router.post("/stop", protect, stopBotController);


// --- Bot Data Endpoints ---

// GET /api/bot/status -> Gets the current status and configuration of the bot
router.get("/status", protect, getBotStatusController);

// GET /api/bot/logs -> Gets the latest activity logs for the bot
router.get("/logs", protect, getBotLogsController);

// GET /api/bot/winners -> Fetches "Golden" strategies from Python ML Server
// 🚀 ADDED: This connects your React Dropdown to the Python JSON files
router.get("/winners", protect, getBotWinnersController);

export default router;
