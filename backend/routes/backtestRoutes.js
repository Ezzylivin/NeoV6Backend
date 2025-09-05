import express from "express";
import { runSingleBacktest, runBatchBacktests, getUserBacktests, runRealistic } from "../controllers/backtestController.js";

const router = express.Router();

router.post("/single", runSingleBacktest);
router.post("/batch", runBatchBacktests);
router.post("/realistic", runRealistic);
router.get("/user/:userId", getUserBacktests);

export default router;
