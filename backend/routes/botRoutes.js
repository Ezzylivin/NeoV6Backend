import express from "express";
import {
  startBotController,
  stopBotController,
  getBotStatusController,
  getHistoryController
} from "../controllers/botController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// POST /api/bot/start -> start a bot
router.post("/start", startBotController);

// POST /api/bot/stop -> stop a bot
router.post("/stop", stopBotController);

// GET /api/bot/status -> bot status
router.get("/status", getBotStatusController);

// GET /api/bot/history -> bot trade history
router.get("/history", getHistoryController);

export default router;
