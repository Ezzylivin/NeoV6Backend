// File: src/backend/routes/strategyRoutes.js
import express from "express";
import { saveStrategy, getStrategy } from "../controllers/strategyController.js";

const router = express.Router();

router.post("/save", saveStrategy);
router.get("/:userId", getStrategy);

export default router;
