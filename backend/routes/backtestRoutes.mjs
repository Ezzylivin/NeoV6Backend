import express from "express";
import { protect } from "../middleware/authMiddleware.js";

// ✅ FIX: All imported function names now correctly end with 'Controller'
import {
    runBacktestController,
    fetchBacktestOptionsController,
    fetchPastBacktestsController,
    getBacktestByIdController,      // Corrected name
    deleteBacktestController,
    previewStrategyController,
    runComboBacktestController    // Corrected name
} from "../controllers/backtestController.js";

const router = express.Router();

// --- Backtest Data Routes ---
router.get("/", protect, fetchPastBacktestsController);
router.get("/options", protect, fetchBacktestOptionsController);

// GET a single backtest by its ID
// ✅ FIX: Uses the correctly imported function name
router.get("/:backtestId", protect, getBacktestByIdController);

// DELETE a single backtest by its ID
router.delete("/:backtestId", protect, deleteBacktestController);


// --- Backtest Execution Routes ---
router.post("/run", protect, runBacktestController);
router.post("/preview", protect, previewStrategyController);

// POST for combined backtests
// ✅ FIX: Uses the correctly imported function name
router.post("/combo", protect, runComboBacktestController);

export default router;
