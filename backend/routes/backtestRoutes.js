// File: backend/routes/backtestRoutes.js
import express from "express";
import { runAndSaveBacktests, getBacktestOptions } from "../controllers/backtestController.js";

const router = express.Router();

// Route: GET /api/backtests/options
router.get("/options", getBacktestOptions);

// Route: POST /api/backtests/run
router.post("/run", runAndSaveBacktests);

// Optional: GET all backtests for a user
// e.g., /api/backtests?userId=USER_ID
import Backtest from "../dbStructure/backtest.js";
router.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success:false, message:"Missing userId" });
  try {
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ success:true, backtests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, message:"Failed to fetch backtests" });
  }
});

export default router;
