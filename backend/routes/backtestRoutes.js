// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  runSingleBacktest,
  runBatch,
  runRealistic,
  getUserBacktests
} from "../controllers/backtestController.js";

const router = express.Router();

// Middleware: restrict allowed methods per route
router.all("*", (req, res, next) => {
  const allowedMethods = {
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

// --- POST /api/backtests/run --- (single backtest)
router.post("/run", runSingleBacktest);

// --- POST /api/backtests/batch --- (batch backtests)
router.post("/batch", runBatch);

// --- POST /api/backtests/realistic --- (realistic mode)
router.post("/realistic", runRealistic);

// --- GET /api/backtests/user/:userId --- (get all user backtests)
router.get("/user/:userId", getUserBacktests);

export default router;
