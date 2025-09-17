import express from "express";
import {
  createStrategyController,
  getStrategiesController,
  updateStrategyController,
  deleteStrategyController
} from "../controllers/strategyController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createStrategyController);
router.get("/", protect, getStrategiesController);
router.put("/:id", protect, updateStrategyController);
router.delete("/:id", protect, deleteStrategyController);

export default router;
