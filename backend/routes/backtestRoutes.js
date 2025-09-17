import express from "express";
import {
  getBacktestOptions,
  runBacktestController,
  runBatchBacktestsController,
  previewStrategyController,
  getUserBacktests,
  getBacktestById,
  deleteBacktest
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/options", protect, getBacktestOptions);
router.post("/", protect, runBacktestController);
router.post("/batch", protect, runBatchBacktestsController);
router.post("/preview", protect, previewStrategyController);
router.get("/", protect, getUserBacktests);
router.get("/:backtestId", protect, getBacktestById);
router.delete("/:backtestId", protect, deleteBacktest);

export default router;
