import express from "express";
import {
  registerUser,
  loginUser,
  getMe,
  updateApiKeys,
  getApiKeys,    // 👈 New Import
  deleteApiKey   // 👈 New Import
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Public routes ---
router.post("/register", registerUser);
router.post("/login", loginUser);

// --- Protected routes ---
router.get("/me", protect, getMe);

// 🚀 API Key Management
router.route("/keys")
  .post(protect, updateApiKeys)  // Save/Update Keys
  .get(protect, getApiKeys);     // Fetch Masked Keys List

router.delete("/keys/:exchange", protect, deleteApiKey); // Delete Key

export default router;
