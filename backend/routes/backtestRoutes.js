// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runSingleBacktest,
  runBatch,
  runRealistic,
  getUserBacktests
} from "../controllers/backtestController.js";

const router = express.Router();

// Middleware: restrict allowed methods per route
router.all("*", (req, res, next) => {
  const allowedMethods = {
    "/options": ["GET"],
    "/run": ["POST"],
    "/batch": ["POST"],
    "/realistic": ["POST"],
    "/user": ["GET"],
  };

  const routeKey = Object.keys(allowedMethods).find(path =>
    req.path.startsWith(path)
  );

  if (routeKey && !allowedMethods[routeKey].includes(req.method)) {
    return res
      .status(405)
      .json({ success: false, message: `Method ${req.method} Not Allowed` });
  }
  next();
});

// --- GET /api/backtests/options --- (backtest dropdowns/options)
router.get("/options", getBacktestOptions);

// --- POST /api/backtests/run --- (single backtest)
router.post("/run", runSingleBacktest);

// --- POST /api/backtests/batch --- (batch backtests)
router.post("/batch", runBatch);

// --- POST /api/backtests/realistic --- (realistic mode)
router.post("/realistic", runRealistic);

// --- GET /api/backtests/user/:userId --- (user’s backtests)
router.get("/user/:userId", getUserBacktests);

export default router;
