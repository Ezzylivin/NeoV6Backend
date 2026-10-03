// File: backend/controllers/adminController.js
// Admin control plane. Every handler here is mounted behind `protect` +
// `requireAdmin`, so req.user is always a verified admin. These let the operator
// (you) see and manage every account, comp tiers by hand, and hit the engine's
// global kill switch — the "control everything" surface.
import User from "../dbStructure/user.js";
import { TIERS, TIER_ORDER } from "../config/tiers.js";

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
    const [total, byTierAgg, admins, verified] = await Promise.all([
      User.countDocuments({}),
      User.aggregate([{ $group: { _id: "$tier", n: { $sum: 1 } } }]),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ isVerified: true }),
    ]);
    const byTier = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
    for (const row of byTierAgg) {
      const key = row._id || "free";
      byTier[key] = (byTier[key] || 0) + row.n;
    }
    const paying = TIER_ORDER.filter((t) => t !== "free").reduce((s, t) => s + (byTier[t] || 0), 0);
    // Rough MRR from the catalog's monthly price × paying users on each tier.
    const mrr = TIER_ORDER.reduce((s, t) => s + (byTier[t] || 0) * (TIERS[t].priceMonthly || 0), 0);
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
