// File: backend/routes/botRoutes.js
import express from "express";
import {
  startBot,
  stopBot,
  getBotStatus,
} from "../controllers/botController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// All bot actions require auth
router.post("/start", authMiddleware, startBot);
router.post("/stop", authMiddleware, stopBot);
router.get("/status", authMiddleware, getBotStatus);

export default router;
