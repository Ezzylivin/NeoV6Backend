// File: backend/routes/adminRoutes.js
// Admin control plane routes. Mounted at /api/admin. Every route is double-gated:
// `protect` (valid JWT → req.user) then `requireAdmin` (role === "admin").
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
import {
  getOverview,
  listUsers,
  updateUser,
  setKillswitch,
  recalibrate,
  getRecalibration,
  research,
  getResearch,
} from "../controllers/adminController.js";

const router = express.Router();

router.get("/overview", protect, requireAdmin, getOverview);
router.get("/users", protect, requireAdmin, listUsers);
router.patch("/users/:id", protect, requireAdmin, updateUser);
router.post("/killswitch", protect, requireAdmin, setKillswitch);
// ♻️ Validation recalibration ("harden the system")
router.post("/recalibrate", protect, requireAdmin, recalibrate);
router.get("/recalibration", protect, requireAdmin, getRecalibration);
// 🔬 Automated research (find the best-performing configs)
router.post("/research", protect, requireAdmin, research);
router.get("/research", protect, requireAdmin, getResearch);

export default router;
