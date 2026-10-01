// File: backend/routes/ledgerRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

const ENGINE_URL = process.env.ML_ENGINE_URL || process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

function botUserId(req) {
  const u = req.user || {};
  return u.id || u._id || null;
}

router.get("/stats", protect, async (req, res) => {
  try {
    const recent = encodeURIComponent(req.query.recent ?? "30");
    const uid = botUserId(req);
    let url = `${ENGINE_URL}/api/ledger/stats?recent=${recent}`;
    if (uid) url += `&user_id=${encodeURIComponent(uid)}`;
    
    const headers = { Accept: "application/json" };
    if (ENGINE_API_KEY) headers["X-Internal-Key"] = ENGINE_API_KEY;
    
    const r = await fetch(url, { headers });
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (e) {
    // BE#11: log the detail server-side; don't leak the engine host/URL to the client.
    console.error("[ledger] engine unreachable:", e.message);
    res.status(502).json({ error: "Ledger engine unreachable" });
  }
});

// POST /api/ledger/clear -> engine clears THIS user's trades (scoped by token id).
router.post("/clear", protect, async (req, res) => {
  try {
    const uid = botUserId(req);
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const headers = { Accept: "application/json" };
    if (ENGINE_API_KEY) headers["X-Internal-Key"] = ENGINE_API_KEY;
    const r = await fetch(`${ENGINE_URL}/api/ledger/clear?user_id=${encodeURIComponent(uid)}`,
      { method: "POST", headers });
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (e) {
    console.error("[ledger] clear engine unreachable:", e.message);
    res.status(502).json({ error: "Ledger engine unreachable" });
  }
});

export default router;
