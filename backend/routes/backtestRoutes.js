import express from "express";
import {
  getBacktestOptions,
  runAndSaveBacktests,
  runBatchBacktests,
  listBacktests,
} from "../controllers/backtestController.js";

const router = express.Router();

router.get("/options", getBacktestOptions);
router.post("/run", runAndSaveBacktests);
router.post("/batch", runBatchBacktests);
router.get("/", listBacktests);

export default router;
