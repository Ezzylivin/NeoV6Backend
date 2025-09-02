// File: src/backend/routes/backtestRoutes.js
import express from "express";
import {
  runAndSaveBacktests,
  getBacktestOptions,
} from "../controllers/backtestController.js";
import Backtest from "../dbStructure/backtest.js";

const router = express.Router();

// --- GET backtest options ---
router.get("/options", getBacktestOptions);

// --- POST run a single backtest ---
router.post("/run", runAndSaveBacktests);

// --- POST run batch backtests (optional) ---
// You may already have a controller for batch runs; include if needed
// router.post("/batch", runBatchBacktests);

// --- GET recent backtests for a user ---
// Supports either URL param /recent/:userId or query ?userId=...
router.get("/recent/:userId?", async (req, res) => {
  const userId = req.params.userId || req.query.userId;
  if (!userId)
    return res
      .status(400)
      .json({ success: false, message: "Missing userId" });

  try {
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, backtests });
  } catch (err) {
    console.error("[Backtest Fetch Error]", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch backtests" });
  }
});

// --- GET a single backtest by ID (optional) ---
router.get("/:id", async (req, res) => {
  try {
    const backtest = await Backtest.findById(req.params.id);
    if (!backtest)
      return res
        .status(404)
        .json({ success: false, message: "Backtest not found" });
    res.json({ success: true, backtest });
  } catch (err) {
    console.error("[Backtest Fetch By ID Error]", err);
    res.status(500).json({ success: false, message: "Failed to fetch backtest" });
  }
});

export default router;
