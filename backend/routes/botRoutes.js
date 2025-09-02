import express from "express";
import {
  startBotController,
  stopBotController,
  getBotStatusController,
  getHistoryController
} from "../controllers/botController.js";

const router = express.Router();

// POST: start a bot
router.post("/start", startBotController);

// POST: stop a bot
router.post("/stop", stopBotController);

// GET: get bot status
router.get("/status/:userId", getBotStatusController);

// GET: get bot history
router.get("/history/:userId", getHistoryController);

export default router;
