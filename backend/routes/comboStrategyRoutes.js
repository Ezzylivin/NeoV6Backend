import express from "express";
import { getComboStrategies, createComboStrategy, deleteComboStrategy } from "../controllers/comboStrategyController.js";
import { protect } from "../middleware/authMiddleware.js"; // assumes you have auth middleware

const router = express.Router();

// ✅ All routes require auth
router.use(protect);

router.get("/combo", getComboStrategies);
router.post("/", createComboStrategy);
router.delete("/:id", deleteComboStrategy);

export default router;
