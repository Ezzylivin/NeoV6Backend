// File: backend/routes/ledgerRoutes.js
// Trade Learning Ledger — proxies the Python engine's ledger endpoints through
// this HTTPS Node backend so the browser never hits the engine's plain-HTTP
// :8000 directly (mixed content). Auth-gated like the other bot routes.
//
// Browser (https, Bearer token) -> this Node backend -> Python engine (http, internal)
//
// Requires Node 18+ (global fetch). On older Node: `npm i node-fetch` then
// `import fetch from "node-fetch";`.
import express from "express";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Base URL of the Python FastAPI engine as reachable FROM this server.
// Use the SAME value botService uses to reach the engine.
const ENGINE_URL = process.env.ML_ENGINE_URL || process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
// Shared secret so the engine accepts this call once ENGINE_API_KEY is set.
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

// Derive the caller's bot identity from the VERIFIED token (never trust a
// client-supplied id). Must match how botController identifies the user when
// starting the bot — it uses req.user.id — so the ledger (stored under that
// same id) filters correctly.
function botUserId(req) {
  const u = req.user || {};
  return u.id || u._id || null;
}

// GET /api/ledger/stats -> engine /api/ledger/stats (scoped to this user)
router.get("/stats", protect, async (req, res) => {
  try {
    const recent = encodeURIComponent(req.query.recent ?? "30");
    const uid = botUserId(req);
    let url = `${ENGINE_URL}/api/ledger/stats?recent=${recent}`;
    if (uid) url += `&user_id=${encodeURIComponent(uid)}`; // omit => global view
    const headers = { Accept: "application/json" };
    if (ENGINE_API_KEY) headers["X-Internal-Key"] = ENGINE_API_KEY;
    const r = await fetch(url, { headers });
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
