// File: backend/routes/strategyLabRoutes.js
// Strategy Lab — proxies the Python engine's /api/strategylab/* endpoints over
// this HTTPS Node backend so the browser never hits the engine's plain-HTTP
// :8000 directly (mixed content). Auth-gated like the other engine proxies.
//
// READ-ONLY: these run historical backtests via exit_lab (the SAME validated
// simulator the live fleet uses). They never start/stop bots or write the
// ledger, so they are safe to call while a fleet is running.
import express from "express";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

const ENGINE_URL = process.env.ML_ENGINE_URL || process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

function engineHeaders(extra = {}) {
  const h = { Accept: "application/json", ...extra };
  if (ENGINE_API_KEY) h["X-Internal-Key"] = ENGINE_API_KEY;
  return h;
}

async function pipe(r, res) {
  const body = await r.text();
  res.status(r.status).type("application/json").send(body);
}

// GET /api/strategylab/options -> engine choices (coins, timeframes, entries,
// exit styles, and the live fleet's default config). For populating the form.
router.get("/options", protect, async (req, res) => {
  try {
    const r = await fetch(`${ENGINE_URL}/api/strategylab/options`, { headers: engineHeaders() });
    await pipe(r, res);
  } catch (e) {
    console.error("[strategylab] options engine unreachable:", e.message);
    res.status(502).json({ error: "Strategy Lab engine unreachable" });
  }
});

// POST /api/strategylab/run -> engine run_single. The engine endpoint takes
// query params, so the JSON body is translated to a (whitelisted, clamped)
// query string here. No user scope: a backtest is on public market history.
router.post("/run", protect, async (req, res) => {
  try {
    const b = req.body || {};
    const qp = new URLSearchParams();
    const passStr = (k) => { if (b[k] != null && String(b[k]).trim() !== "") qp.set(k, String(b[k])); };
    ["symbol", "timeframe", "entry", "direction", "style", "start", "end"].forEach(passStr);

    const rp = Number(b.riskPct ?? b.risk_pct);
    if (Number.isFinite(rp)) qp.set("risk_pct", String(Math.min(50, Math.max(0.1, rp))));

    const ib = Number(b.initialBalance ?? b.initial_balance);
    if (Number.isFinite(ib) && ib > 0) qp.set("initial_balance", String(ib));

    const legs = Number(b.maxLegs ?? b.max_legs);
    if (Number.isFinite(legs)) qp.set("max_legs", String(Math.min(5, Math.max(1, Math.round(legs)))));

    const addAtr = Number(b.addAtr ?? b.add_atr);
    if (Number.isFinite(addAtr)) qp.set("add_atr", String(Math.min(5, Math.max(0.25, addAtr))));

    const r = await fetch(`${ENGINE_URL}/api/strategylab/run?${qp.toString()}`, {
      method: "POST",
      headers: engineHeaders(),
    });
    await pipe(r, res);
  } catch (e) {
    console.error("[strategylab] run engine unreachable:", e.message);
    res.status(502).json({ error: "Strategy Lab engine unreachable" });
  }
});

// POST /api/strategylab/portfolio -> engine /api/exitlab/portfolio. Runs ONE
// config across many coins as a combined portfolio (blended equity) — the
// diversification view. Read-only; body params become engine query params.
router.post("/portfolio", protect, async (req, res) => {
  try {
    const b = req.body || {};
    const qp = new URLSearchParams();
    const passStr = (k, ek) => { if (b[k] != null && String(b[k]).trim() !== "") qp.set(ek || k, String(b[k])); };
    passStr("timeframe");
    passStr("entry");
    passStr("direction");
    passStr("style");
    if (Array.isArray(b.symbols) && b.symbols.length) qp.set("symbols", b.symbols.join(","));
    else passStr("symbols");
    const r = await fetch(`${ENGINE_URL}/api/exitlab/portfolio?${qp.toString()}`, {
      method: "POST",
      headers: engineHeaders(),
    });
    await pipe(r, res);
  } catch (e) {
    console.error("[strategylab] portfolio engine unreachable:", e.message);
    res.status(502).json({ error: "Strategy Lab engine unreachable" });
  }
});

export default router;
