// File: backend/routes/backtestRoutes.js
import express from "express";
import {
  getBacktestOptions,
  runAndSaveBacktests,
  runBatchBacktestsController,
  getUserBacktests,
  runRealisticBacktestsController
} from "../controllers/backtestController.js";

const router = express.Router();

// Middleware to handle unsupported methods
router.all("*", (req, res, next) => {
  const allowedMethods = {
    "/options": ["GET"],
    "/run": ["POST"],
    "/batch": ["POST"],
    "/user/:userId": ["GET"],
    "/realistic": ["POST"], // ✅ new realistic route
  };

  const routeKey = Object.keys(allowedMethods).find(path => req.path.startsWith(path)) || null;
  if (routeKey && !allowedMethods[routeKey].includes(req.method)) {
    return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
  }
  next();
});

// --- GET /api/backtests/options ---
router.get("/options", getBacktestOptions);

// --- POST /api/backtests/run ---
router.post("/run", runAndSaveBacktests);

// --- POST /api/backtests/batch ---
router.post("/batch", runBatchBacktestsController);

// --- POST /api/backtests/realistic ---
router.post("/realistic", runRealisticBacktestsController);

// --- GET /api/backtests/user/:userId ---
router.get("/user/:userId", getUserBacktests);

export default router;
