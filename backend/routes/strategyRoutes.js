// src/backend/routes/strategyRoutes.js
import express from "express";
import {
  getStrategies,
  getStrategyById,
  createStrategy,
  updateStrategy,
  deleteStrategy,
} from "../controllers/strategyController.js";

const router = express.Router();

router.get("/", getStrategies);            // ?userId=
router.get("/:id", getStrategyById);
router.post("/", createStrategy);
router.put("/:id", updateStrategy);
router.delete("/:id", deleteStrategy);

export default router;
