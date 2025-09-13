// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runBacktestController,
  previewStrategyController,
  runBatchBacktestsController,
  getUserBacktests,
  getBacktestById,
  deleteBacktest
} from "../controllers/backtestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/options", getBacktestOptions);

router.post("/run", runBacktestController);

router.post("/preview", previewStrategyController);

router.post("/batch", runBatchBacktestsController);

router.get("/", getUserBacktests);

router.route("/:backtestId")
  .get(getBacktestById)
  .delete(deleteBacktest);

export default router;
