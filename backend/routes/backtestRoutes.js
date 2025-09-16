import express from "express";
import { getBacktests, getBacktestOptions, runBacktest, runBatchBacktests } from "../controllers/backtestController.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authMiddleware, getBacktests);
router.get("/options", authMiddleware, getBacktestOptions);
router.post("/", authMiddleware, runBacktest);
router.post("/batch", authMiddleware, runBatchBacktests);

export default router;
