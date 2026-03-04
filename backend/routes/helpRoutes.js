// File: src/routes/helpRoutes.js
import express from "express";
import { submitTicket, getFaqs, getStatus } from "../controllers/helpCenterController.js";
import { protect } from "../middleware/authMiddleware.js"; // Ensure user is logged in

const router = express.Router();

router.get("/faq", getFaqs);        // Public or Private
router.get("/status", getStatus);   // Public
router.post("/ticket", protect, submitTicket); // Must be logged in

export default router;
