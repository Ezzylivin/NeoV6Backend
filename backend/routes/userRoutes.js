import express from "express";
import {
  registerUser,
  loginUser,
  getMe,
  updateApiKeys
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Public routes ---
router.post("/register", registerUser);
router.post("/login", loginUser);

// --- Protected routes ---
router.get("/me", protect, getMe);
router.post("/keys", protect, updateApiKeys);

export default router;
