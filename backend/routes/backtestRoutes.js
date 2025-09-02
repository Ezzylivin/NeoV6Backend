// File: src/backend/routes/backtestRoutes.js
import express from "express";
import { runAndSaveBacktests, getBacktestOptions } from "../controllers/backtestController.js";
import Backtest from "../dbStructure/backtest.js";

const router = express.Router();

// GET options
router.get("/options", getBacktestOptions);

// POST run backtest
router.post("/run", runAndSaveBacktests);

// ✅ GET recent backtests for a user (supports both query & param style)
router.get("/recent/:userId?", async (req, res) => {
  const userId = req.params.userId || req.query.userId;
  if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

  try {
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, backtests });
  } catch (err) {
    console.error("Error fetching backtests:", err);
    res.status(500).json({ success: false, message: "Failed to fetch backtests" });
  }
});

export default router;
