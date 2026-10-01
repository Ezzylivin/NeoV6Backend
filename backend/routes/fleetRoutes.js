// File: backend/routes/fleetRoutes.js
// Fleet orchestration — proxies the Python engine's /api/fleet/* endpoints
// through this HTTPS Node backend so the browser never hits the engine's
// plain-HTTP :8000 directly (mixed content). Auth-gated like the bot routes.
//
// Browser (https, Bearer token) -> this Node backend -> Python engine (http, internal)
//
// SECURITY: the fleet identity is ALWAYS derived from the VERIFIED token
// (req.user.id), never from a client-supplied value. A user can only ever
// start / view / stop their OWN fleet. Requires Node 18+ (global fetch).
import express from "express";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Base URL of the Python FastAPI engine as reachable FROM this server (same
// value the ledger proxy + botService use).
const ENGINE_URL = process.env.ML_ENGINE_URL || process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

// Identity from the verified token only — matches how the bot/ledger routes
// scope a user, so a fleet started here is keyed under the same id.
function fleetUserId(req) {
  const u = req.user || {};
  return u.id || u._id || null;
}

function engineHeaders(extra = {}) {
  const h = { Accept: "application/json", ...extra };
  if (ENGINE_API_KEY) h["X-Internal-Key"] = ENGINE_API_KEY;
  return h;
}

// Pipe an engine response straight back to the browser, preserving status.
async function pipe(r, res) {
  const body = await r.text();
  res.status(r.status).type("application/json").send(body);
}

// POST /api/fleet/start  -> engine POST /api/fleet/start
// Body (client): { symbols?, capitalEach?, fleetMaxDrawdownPct?, sizeByConviction?,
//                  longTimeframe?, shortTimeframe? }  — userId is injected from the token.
router.post("/start", protect, async (req, res) => {
  try {
    const uid = fleetUserId(req);
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const b = req.body || {};
    const payload = {
      userId: uid,
      symbols: Array.isArray(b.symbols) ? b.symbols : undefined,
      capitalEach: b.capitalEach,
      fleetMaxDrawdownPct: b.fleetMaxDrawdownPct,
      sizeByConviction: b.sizeByConviction,
      longTimeframe: b.longTimeframe,
      shortTimeframe: b.shortTimeframe,
    };
    const r = await fetch(`${ENGINE_URL}/api/fleet/start`, {
      method: "POST",
      headers: engineHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    await pipe(r, res);
  } catch (e) {
    console.error("[fleet] start engine unreachable:", e.message);
    res.status(502).json({ error: "Fleet engine unreachable" });
  }
});

// GET /api/fleet/status  -> engine GET /api/fleet/status?userId=<token id>
router.get("/status", protect, async (req, res) => {
  try {
    const uid = fleetUserId(req);
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const r = await fetch(`${ENGINE_URL}/api/fleet/status?userId=${encodeURIComponent(uid)}`,
      { headers: engineHeaders() });
    await pipe(r, res);
  } catch (e) {
    console.error("[fleet] status engine unreachable:", e.message);
    res.status(502).json({ error: "Fleet engine unreachable" });
  }
});

// GET /api/fleet/drift  -> engine GET /api/fleet/drift?userId=<token id>
router.get("/drift", protect, async (req, res) => {
  try {
    const uid = fleetUserId(req);
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const r = await fetch(`${ENGINE_URL}/api/fleet/drift?userId=${encodeURIComponent(uid)}`,
      { headers: engineHeaders() });
    await pipe(r, res);
  } catch (e) {
    console.error("[fleet] drift engine unreachable:", e.message);
    res.status(502).json({ error: "Fleet engine unreachable" });
  }
});

// GET /api/fleet/bot?symbol=&side=  -> engine per-coin child detail (positions,
// markers, signals) for the unified Fleet page chart. Scoped to the caller.
router.get("/bot", protect, async (req, res) => {
  try {
    const uid = fleetUserId(req);
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const symbol = encodeURIComponent(req.query.symbol || "");
    const side = encodeURIComponent(req.query.side || "");
    const url = `${ENGINE_URL}/api/fleet/bot?userId=${encodeURIComponent(uid)}&symbol=${symbol}&side=${side}`;
    const r = await fetch(url, { headers: engineHeaders() });
    await pipe(r, res);
  } catch (e) {
    console.error("[fleet] bot engine unreachable:", e.message);
    res.status(502).json({ error: "Fleet engine unreachable" });
  }
});

// GET /api/fleet/activity?limit=  -> recent closed trades across the whole fleet
// (the live trade feed). Scoped to the caller.
router.get("/activity", protect, async (req, res) => {
  try {
    const uid = fleetUserId(req);
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const limit = encodeURIComponent(req.query.limit || "20");
    const r = await fetch(`${ENGINE_URL}/api/fleet/activity?userId=${encodeURIComponent(uid)}&limit=${limit}`,
      { headers: engineHeaders() });
    await pipe(r, res);
  } catch (e) {
    console.error("[fleet] activity engine unreachable:", e.message);
    res.status(502).json({ error: "Fleet engine unreachable" });
  }
});

// GET /api/fleet/regime  -> engine GET /api/fleet/regime  (no user scope; market-wide)
router.get("/regime", protect, async (req, res) => {
  try {
    const r = await fetch(`${ENGINE_URL}/api/fleet/regime`, { headers: engineHeaders() });
    await pipe(r, res);
  } catch (e) {
    console.error("[fleet] regime engine unreachable:", e.message);
    res.status(502).json({ error: "Fleet engine unreachable" });
  }
});

// POST /api/fleet/stop  -> engine POST /api/fleet/stop  (only the caller's own fleet)
router.post("/stop", protect, async (req, res) => {
  try {
    const uid = fleetUserId(req);
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const r = await fetch(`${ENGINE_URL}/api/fleet/stop`, {
      method: "POST",
      headers: engineHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ userId: uid }),
    });
    await pipe(r, res);
  } catch (e) {
    console.error("[fleet] stop engine unreachable:", e.message);
    res.status(502).json({ error: "Fleet engine unreachable" });
  }
});

export default router;
