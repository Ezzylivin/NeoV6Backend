// File: src/backend/routes/backtestRoutes.js
import express from "express";
import * as backtestController from "../controllers/backtestController.js";
import Backtest from "../dbStructure/backtest.js";

const router = express.Router();

// 1️⃣ Get recent backtests for a user
// GET /api/backtests/recent/:userId
router.get("/recent/:userId", backtestController.getRecentBacktests);

// 2️⃣ Run and save a backtest
// POST /api/backtests/run
router.post("/run", backtestController.runAndSaveBacktests);

// 3️⃣ Get backtest options
// GET /api/backtests/options
router.get("/options", backtestController.getBacktestOptions);

// 4️⃣ Optional: Get all backtests for a user via query param
// GET /api/backtests?userId=USER_ID
router.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

  try {
    const backtests = await Backtest.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, backtests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch backtests" });
  }
});

export default router;
