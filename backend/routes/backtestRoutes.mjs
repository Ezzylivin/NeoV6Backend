import express from "express";
import {
  runBacktestController,
  fetchBacktestOptionsController,
  fetchPastBacktestsController,
  getBacktestById,
  deleteBacktestController,
  previewStrategyController,
  runComboBacktest // ✅ 1. Import the new controller function
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

console.log("✅ backtestRoutes.mjs loaded");


const router = express.Router();

// --- Existing Routes (no changes) ---
router.get("/", protect, fetchPastBacktestsController);
router.get("/options", protect, fetchBacktestOptionsController);
router.post("/run", protect, runBacktestController);
router.post("/preview", protect, previewStrategyController);
router.get("/:backtestId", protect, getBacktestById);
router.delete("/:backtestId", protect, deleteBacktestController);

// ✅ 2. Add the new route for combined backtests
router.post("/combo", protect, runComboBacktest);

export default router;
