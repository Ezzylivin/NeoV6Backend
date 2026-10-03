// File: backend/controllers/adminController.js
// Admin control plane. Every handler here is mounted behind `protect` +
// `requireAdmin`, so req.user is always a verified admin. These let the operator
// (you) see and manage every account, comp tiers by hand, and hit the engine's
// global kill switch — the "control everything" surface.
import User from "../dbStructure/user.js";
import { TIERS, TIER_ORDER } from "../config/tiers.js";
import { sendMail, isMailConfigured } from "../utils/mailer.js";

const ENGINE_URL =
  process.env.ML_ENGINE_URL || process.env.ML_SERVER_URL || "http://74.208.28.77:8000";
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

const ROLES = ["user", "admin", "whale"]; // matches the user schema enum

function engineHeaders(extra = {}) {
  const h = { Accept: "application/json", ...extra };
  if (ENGINE_API_KEY) h["X-Internal-Key"] = ENGINE_API_KEY;
  return h;
}

/**
 * GET /api/admin/overview
 * High-level counts for the admin dashboard header: total users, how many on
 * each tier, how many admins, how many with a live (non-free) subscription.
 */
export const getOverview = async (req, res) => {
  try {
    const [total, byTierAgg, payingAgg, admins, verified] = await Promise.all([
      User.countDocuments({}),
      User.aggregate([{ $group: { _id: "$tier", n: { $sum: 1 } } }]),
      // Paying = non-admin, non-comped users on a paid tier. Admins are comped
      // (auto-whale) so they must NOT count toward paying users or MRR.
      User.aggregate([
        { $match: { role: { $ne: "admin" }, tier: { $ne: "free" }, tierManualOverride: { $ne: true } } },
        { $group: { _id: "$tier", n: { $sum: 1 } } },
      ]),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ isVerified: true }),
    ]);
    const byTier = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
    for (const row of byTierAgg) {
      const key = row._id || "free";
      byTier[key] = (byTier[key] || 0) + row.n;
    }
    // Paying count + rough MRR from the catalog's monthly price, excluding
    // admins and hand-comped accounts.
    let paying = 0;
    let mrr = 0;
    for (const row of payingAgg) {
      paying += row.n;
      mrr += row.n * ((TIERS[row._id] && TIERS[row._id].priceMonthly) || 0);
    }
    res.json({ total, byTier, admins, verified, paying, estMrr: mrr });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/users?q=&tier=&role=&limit=&page=
 * Paginated user directory. `q` matches username/email (case-insensitive).
 */
export const listUsers = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filter = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ username: rx }, { email: rx }, { walletAddress: rx }];
    }
    if (req.query.tier && TIERS[req.query.tier]) filter.tier = req.query.tier;
    if (req.query.role && ROLES.includes(req.query.role)) filter.role = req.query.role;

    const [rows, count] = await Promise.all([
      User.find(filter)
        .select(
          "username email walletAddress role tier subscriptionStatus subscriptionInterval currentPeriodEnd tierManualOverride isVerified onboardedAt createdAt activeBots"
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    // Trim activeBots to a count so we don't ship full configs to the table.
    const users = rows.map((u) => ({
      ...u,
      activeBotCount: Array.isArray(u.activeBots) ? u.activeBots.length : 0,
      activeBots: undefined,
    }));
    res.json({ users, count, page, limit, pages: Math.ceil(count / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/admin/users/:id   { tier?, role?, subscriptionStatus? }
 * Comp or change a user's plan/authz by hand. Setting `tier` manually flags
 * `tierManualOverride` so a later Stripe webhook won't silently revert it.
 * Guard rails: can't demote yourself, and can't remove the last admin.
 */
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { tier, role, subscriptionStatus } = req.body || {};
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ message: "User not found" });

    const update = {};
    if (tier != null) {
      if (!TIERS[tier]) return res.status(400).json({ message: `Unknown tier '${tier}'` });
      update.tier = tier;
      update.tierManualOverride = true; // hand-set, protect from webhook stomp
    }
    if (role != null) {
      if (!ROLES.includes(role)) return res.status(400).json({ message: `Unknown role '${role}'` });
      // Don't let an admin demote themselves (lock-out foot-gun).
      if (String(target._id) === String(req.user.id) && role !== "admin") {
        return res.status(400).json({ message: "You can't remove your own admin role." });
      }
      // Don't remove the last remaining admin.
      if (target.role === "admin" && role !== "admin") {
        const admins = await User.countDocuments({ role: "admin" });
        if (admins <= 1) return res.status(400).json({ message: "Can't remove the last admin." });
      }
      update.role = role;
    }
    if (subscriptionStatus !== undefined) update.subscriptionStatus = subscriptionStatus || null;

    if (!Object.keys(update).length) return res.status(400).json({ message: "Nothing to update" });

    const saved = await User.findByIdAndUpdate(id, { $set: update }, { new: true })
      .select("username email role tier subscriptionStatus tierManualOverride")
      .lean();
    res.json({ user: saved });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/admin/killswitch   { on }
 * Global emergency halt of ALL new entries across the whole engine (every
 * user's fleet). Proxies the Python engine's operator kill switch.
 */
export const setKillswitch = async (req, res) => {
  try {
    const on = req.body?.on !== false; // default engage
    const r = await fetch(`${ENGINE_URL}/api/fleet/killswitch?on=${on ? "true" : "false"}`, {
      method: "POST",
      headers: engineHeaders(),
    });
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (err) {
    res.status(502).json({ message: "Engine unreachable", error: err.message });
  }
};

/**
 * POST /api/admin/recalibrate   { level?, maxLegs? }
 * "Harden the system" on demand — re-run the hard out-of-sample + cost-stress
 * validation that gates live pyramiding, at a chosen strictness, and rewrite the
 * eligibility registry. Proxies the engine; returns immediately (runs in bg).
 */
export const recalibrate = async (req, res) => {
  try {
    const level = encodeURIComponent(req.body?.level || "strict");
    const maxLegs = req.body?.maxLegs;
    let url = `${ENGINE_URL}/api/fleet/recalibrate?level=${level}`;
    if (maxLegs) url += `&max_legs=${encodeURIComponent(maxLegs)}`;
    if (req.body?.coinbaseOne) url += `&coinbase_one=true`;
    const r = await fetch(url, { method: "POST", headers: engineHeaders() });
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (err) {
    res.status(502).json({ message: "Engine unreachable", error: err.message });
  }
};

/**
 * GET /api/admin/recalibration
 * Last recalibration result (per-leg verdicts + cleared coins) and whether one
 * is running now, plus the automated cadence. Read-only proxy.
 */
export const getRecalibration = async (req, res) => {
  try {
    const r = await fetch(`${ENGINE_URL}/api/fleet/recalibration`, { headers: engineHeaders() });
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (err) {
    res.status(502).json({ message: "Engine unreachable", error: err.message });
  }
};

/**
 * POST /api/admin/research — run the cross-coin research sweep now (find the
 * best-performing exit/sizing configs). Background; proxies the engine.
 */
export const research = async (req, res) => {
  try {
    const r = await fetch(`${ENGINE_URL}/api/fleet/research`, { method: "POST", headers: engineHeaders() });
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (err) {
    res.status(502).json({ message: "Engine unreachable", error: err.message });
  }
};

/**
 * GET /api/admin/research — latest research ranking + running state + cadence.
 */
export const getResearch = async (req, res) => {
  try {
    const r = await fetch(`${ENGINE_URL}/api/fleet/research`, { headers: engineHeaders() });
    const body = await r.text();
    res.status(r.status).type("application/json").send(body);
  } catch (err) {
    res.status(502).json({ message: "Engine unreachable", error: err.message });
  }
};

// Minimal branded HTML wrapper for admin broadcasts (plain text -> paragraphs).
function broadcastHtml(subject, body) {
  const safe = String(body || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("");
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0b0f14;color:#e7eef6;padding:24px;border-radius:12px;max-width:560px;margin:auto;border:1px solid #1f2b38">
    <h2 style="color:#34d399;margin:0 0 14px">${String(subject || "").replace(/</g, "&lt;")}</h2>
    ${safe}
    <p style="color:#6b7684;font-size:11px;margin-top:22px">NeoV6 Trading · you're receiving this because you have a NeoV6 account.</p>
  </div>`;
}

/**
 * POST /api/admin/broadcast  { subject, body, tier?, role?, onlyVerified?, userIds? }
 * Send an email to many users at once. Audience = explicit userIds, or a filter
 * (tier / role / onlyVerified); no filter = ALL users. Each recipient gets their
 * own email (no exposed To list). Admin-gated.
 */
export const broadcastEmail = async (req, res) => {
  try {
    const { subject, body, tier, role, onlyVerified, userIds } = req.body || {};
    if (!subject || !String(subject).trim() || !body || !String(body).trim()) {
      return res.status(400).json({ message: "Subject and body are required." });
    }
    if (!isMailConfigured()) {
      return res.status(503).json({ message: "Email isn't configured yet — set the SMTP_* env vars to enable sending." });
    }

    const filter = {};
    if (Array.isArray(userIds) && userIds.length) {
      filter._id = { $in: userIds };
    } else {
      if (tier && TIERS[tier]) filter.tier = tier;
      if (role && ROLES.includes(role)) filter.role = role;
      if (onlyVerified) filter.isVerified = true;
    }

    const users = await User.find(filter).select("email username").lean();
    const recipients = users.filter((u) => u.email).slice(0, 1000); // safety cap
    if (!recipients.length) return res.status(400).json({ message: "No recipients match that audience." });

    const html = broadcastHtml(subject, body);
    let sent = 0, failed = 0;
    for (const u of recipients) {
      const r = await sendMail({ to: u.email, subject: String(subject), html, text: String(body) });
      if (r.sent) sent++; else failed++;
    }
    res.json({ matched: recipients.length, sent, failed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
