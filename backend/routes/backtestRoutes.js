// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  runAndSaveBacktests,
  getBacktestsByUser,
  getBacktestOptions,
} from "../controllers/backtestController.js";

const router = express.Router();

// Run and save new backtest
router.post("/", runAndSaveBacktests);

// Fetch backtests for a specific user
router.get("/", getBacktestsByUser);

// Fetch dropdown options for backtest form
router.get("/options", getBacktestOptions);

export default router;
