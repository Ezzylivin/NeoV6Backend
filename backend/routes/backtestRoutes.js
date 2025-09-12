// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runBacktestController,
  previewStrategyController, // <-- Import the preview controller
  runBatchBacktestsController,
  getUserBacktests,
  getBacktestById,
  deleteBacktest
} from "../controllers/backtestController.js";
// import { protect } from "../middleware/authMiddleware.js"; // You'll need an auth middleware

const router = express.Router();

// All routes below this would be protected by authentication
// router.use(protect);

// GET available options for the UI
router.get("/options", getBacktestOptions);

// POST run a new backtest and save it
router.post("/run", runBacktestController);

// POST run a temporary "preview" backtest that doesn't save
router.post("/preview", previewStrategyController); // <-- Add this route

// POST run multiple backtests
router.post("/run-batch", runBatchBacktestsController);

// GET all backtests for the authenticated user
router.get("/", getUserBacktests); // <-- Simplified for security

// GET or DELETE a single backtest by its ID
router.route("/:backtestId")
  .get(getBacktestById)
  .delete(deleteBacktest);

export default router;
