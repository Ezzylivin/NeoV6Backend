// File: backend/routes/billingRoutes.js
// Subscription billing (Stripe) — the authenticated JSON endpoints. The webhook
// is NOT here: it needs a raw body for signature verification and is mounted
// directly in app.js before the JSON body parser.
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getPlans, createCheckout, createPortal } from "../controllers/billingController.js";

const router = express.Router();

router.get("/plans", protect, getPlans);       // catalog + caller's subscription
router.post("/checkout", protect, createCheckout); // -> Stripe Checkout URL
router.post("/portal", protect, createPortal);     // -> Stripe Customer Portal URL

export default router;
