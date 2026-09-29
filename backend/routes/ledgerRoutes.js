// File: backend/routes/ledgerRoutes.js
// Trade Learning Ledger — proxies the Python engine's ledger endpoints through
// this HTTPS Node backend so the browser never hits the engine's plain-HTTP
// :8000 directly (mixed content). Auth-gated like the other bot routes.
import express from "express";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Base URL of the Python FastAPI engine as reachable FROM this server.
// Use the SAME value botController uses to reach the engine (env or constant).
const ENGINE_URL = process.env.ML_ENGINE_URL || "http://74.208.28.77:8000";

// GET /api/ledger/stats -> engine /api/ledger/stats
router.get("/stats", protect, async (req, res) => {
  try {
    const recent = encodeURIComponent(req.query.recent ?? "30");
    const r = await fetch(`${ENGINE_URL}/api/ledger/stats?recent=${recent}`, {
      headers: { Accept: "application/json" },
    });
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (e) {
    res.status(502).json({ error: "Ledger engine unreachable", detail: String(e) });
  }
});

export default router;
