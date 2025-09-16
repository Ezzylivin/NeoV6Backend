// File: backend/routes/backtestRoutes.js
// UPGRADED: Corrected function names to match the backtestController exports.

import express from "express";
import {
    // Use aliasing to import the correct functions with the names the router expects
    getUserBacktests as getBacktests,
    getBacktestOptions,
    runBacktestController as runBacktest,
    runBatchBacktestsController as runBatchBacktests
} from "../controllers/backtestController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Define API endpoints for backtesting
// These routes are now correctly linked to the controller functions
router.get("/", authMiddleware, getBacktests);
router.get("/options", authMiddleware, getBacktestOptions);
router.post("/", authMiddleware, runBacktest);
router.post("/batch", authMiddleware, runBatchBacktests);

export default router;
