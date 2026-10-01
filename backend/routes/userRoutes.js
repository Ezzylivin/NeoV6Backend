import express from "express";
import {
  registerUser,
  loginUser,
  getMe,
  updateApiKeys,
  getApiKeys,    // 👈 New Import
  deleteApiKey,  // 👈 New Import
  verifyEmail,
  resendVerification,
  updateEmail
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Public routes ---
router.post("/register", registerUser);
router.post("/login", loginUser);
// 📧 Email verification (public — the link is clicked from an email, no token yet)
router.get("/verify/:token", verifyEmail);

// --- Protected routes ---
router.get("/me", protect, getMe);
// 📧 Resend verification for the logged-in user
router.post("/resend-verification", protect, resendVerification);
// 📧 Change email (resets verification + emails the new address a fresh link)
router.put("/email", protect, updateEmail);

// 🚀 API Key Management
router.route("/keys")
  .post(protect, updateApiKeys)  // Save/Update Keys
  .get(protect, getApiKeys);     // Fetch Masked Keys List

router.delete("/keys/:exchange", protect, deleteApiKey); // Delete Key

export default router;
