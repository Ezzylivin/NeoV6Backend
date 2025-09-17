import express from "express";
import {
  startBotController,
  stopBotController,
  getBotStatusController,
  getHistoryController
} from "../controllers/botController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/start", protect, startBotController);
router.post("/stop", protect, stopBotController);
router.get("/status", protect, getBotStatusController);
router.get("/history", protect, getHistoryController);

export default router;
