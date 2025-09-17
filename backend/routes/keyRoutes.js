import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { updateApiKeys } from "../controllers/userController.js";

const router = express.Router();

router.post("/", protect, updateApiKeys);

export default router;
