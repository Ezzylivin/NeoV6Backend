// File: backend/routes/dataRoutes.js
import express from "express";
import { downloadData } from "../controllers/dataController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Now secured ✅
router.post("/download", authMiddleware, downloadData);

export default router;
