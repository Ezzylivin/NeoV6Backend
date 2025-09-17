import express from "express";
import {
  runBacktestController,
  runBatchBacktestsController,
  getBacktestOptions,
  getUserBacktests,
  getBacktestById,
  deleteBacktest,
  previewStrategyController
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getUserBacktests);
router.get("/options", protect, getBacktestOptions);
router.get("/:backtestId", protect, getBacktestById);
router.post("/run", protect, runBacktestController);
router.post("/batch", protect, runBatchBacktestsController);
router.post("/preview", protect, previewStrategyController);
router.delete("/:backtestId", protect, deleteBacktest);

export default router;
