// File: backend/routes/botRoutes.js
// UPGRADED: This router is now fully synchronized with the botController.

import express from "express";
import {
  startBotController,
  stopBotController,
  getBotStatusController,
  getBotLogsController // ✅ FIXED: Imported the correct controller for logs
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
router.get("/logs", protect, getBotLogsController); // ✅ FIXED: Corrected the route and controller

export default router;
