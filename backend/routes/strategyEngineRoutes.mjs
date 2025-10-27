import express from "express";
import {
  saveStrategyController,
  getStrategiesController,
  runStrategyController
} from "../controllers/strategyEngineController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/save", protect, saveStrategyController);
router.get("/", protect, getStrategiesController);
router.post("/run", protect, runStrategyController);

export default router;
