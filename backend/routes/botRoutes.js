// File: src/backend/routes/tradingBotRoutes.js
import express from "express";
import {
  startBotController,
  stopBotController,
  getBotStatusController,
  getHistoryController, // Make sure this exists in botController.js
} from "../controllers/botController.js";

const router = express.Router();

// 1️⃣ Trading Bot History for a user
// GET /api/tradingbots/history/:userId
router.get("/history/:userId", getHistoryController);

// 2️⃣ Start a bot
router.post("/start", startBotController);

// 3️⃣ Stop a bot
router.post("/stop", stopBotController);

// 4️⃣ Get bot status
router.get("/status", getBotStatusController);

// 5️⃣ Optional test route
router.get("/test", (req, res) => {
  res.json({ bot: "Bot endpoint is working." });
});

export default router;
