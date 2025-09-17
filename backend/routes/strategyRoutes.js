import express from "express";
import {
  createStrategy,
  updateStrategy,
  getUserStrategies,
  deleteStrategy
} from "../controllers/strategyController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createStrategy);
router.get("/", protect, updateStrategy);
router.put("/:id", protect, getUserStrategies);
router.delete("/:id", protect, deleteStrategy);

export default router;
