// File: backend/config/tiers.js
// Subscription tier catalog — the single source of truth for pricing and what
// each plan unlocks. The admin panel, the billing (Stripe) layer, the Plans
// page, and the fleet LIVE-trading gate all read from here, so changing a limit
// in ONE place updates pricing, enforcement, and marketing together.
//
// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT MODEL (what makes NeoV6 beat 3Commas / Cryptohopper / Coinrule / etc.)
//
//   1. PAPER TRADING IS UNLIMITED AND FREE, FOR EVERYONE, FOREVER.
//      No bot cap, no coin cap, no leg cap, full engine, full Strategy Lab,
//      full self-learning ledger. Competitors cap even their demo — we don't.
//      Paper is NEVER gated or clamped anywhere in the app.
//
//   2. THE PAID TIERS SELL *LIVE* TRADING — and live can only ever be unlocked
//      after a strategy passes the Strategy Lab's holdout + cost-stress
//      validation. Everyone else sells "a bot"; we sell "a strategy you proved
//      works, then deployed." Live scales by coins / legs / exchanges by tier.
//
//   3. FLAT PRICE, NO PER-TRADE CUT, NO PERFORMANCE FEE (Pionex bites every
//      trade; we don't). Annual billing = 6 MONTHS FREE (pay for 6, get 12 →
//      50% off; `priceAnnual` is the per-month equivalent = priceMonthly / 2).
//      7-day live trial, no card.
//
// `stripePriceIdMonthly` / `stripePriceIdAnnual` are read from env so you can
// point each tier at your own Stripe Price without editing code:
//   STRIPE_PRICE_TRADER_M / _TRADER_A, _PRO_M / _PRO_A, _WHALE_M / _WHALE_A.
// Until a tier's price id is set, checkout for that tier stays disabled.
// ─────────────────────────────────────────────────────────────────────────────

export const TIER_ORDER = ["free", "trader", "pro", "whale"];

export const TIERS = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Unlimited paper trading, forever.",
    priceMonthly: 0,
    priceAnnual: 0,          // per-month equivalent when billed yearly
    trialDays: 0,
    stripePriceIdMonthly: null, // free never checks out
    stripePriceIdAnnual: null,
    blurb: "The full engine on paper — no limits, no card, no catch.",
    // LIVE gating (paper is always unlimited and ignores all of these):
    liveEnabled: false,
    maxLiveCoins: 0,
    maxLiveLegs: 0,
    exchanges: 0,
    highlight: false,
    features: [
      "Unlimited paper trading — any coins, any legs",
      "Full Strategy Lab: backtests + holdout validation",
      "Self-learning ledger & neural-flow gates",
      "Guided tour & full Help Center",
    ],
  },
  trader: {
    id: "trader",
    name: "Trader",
    tagline: "Go live on a validated setup.",
    priceMonthly: 29,
    priceAnnual: 14.5, // 6 months free: ($29 × 6) / 12

    trialDays: 7,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_TRADER_M || null,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_TRADER_A || null,
    blurb: "Everything free gives you, plus real-money deployment once your strategy passes validation.",
    liveEnabled: true,
    maxLiveCoins: 3,
    maxLiveLegs: 2,
    exchanges: 1,
    highlight: false,
    features: [
      "Everything in Free (unlimited paper)",
      "LIVE trading on up to 3 coins",
      "2-leg pyramiding live",
      "1 connected exchange",
      "Validated Go-Live hand-off",
      "7-day trial · no card to start",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "A full validated fleet, live.",
    priceMonthly: 79,
    priceAnnual: 39.5, // 6 months free: ($79 × 6) / 12

    trialDays: 7,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_M || null,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_PRO_A || null,
    blurb: "Scale live across the whole fleet with advanced risk controls — for less than most rivals' mid tier.",
    liveEnabled: true,
    maxLiveCoins: 8,
    maxLiveLegs: 5,
    exchanges: 3,
    highlight: true, // "Most popular"
    features: [
      "Everything in Trader",
      "LIVE on up to 8 coins",
      "5-leg pyramiding live",
      "Up to 3 exchanges",
      "Portfolio-blend risk engine",
      "Priority fills & alerts",
    ],
  },
  whale: {
    id: "whale",
    name: "Whale",
    tagline: "No limits. Every coin, every leg.",
    priceMonthly: 199,
    priceAnnual: 99.5, // 6 months free: ($199 × 6) / 12

    trialDays: 7,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_WHALE_M || null,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_WHALE_A || null,
    blurb: "Unlimited live deployment, every exchange, priority everything — still under half of Coinrule's top tier.",
    liveEnabled: true,
    maxLiveCoins: null, // unlimited
    maxLiveLegs: null,  // unlimited
    exchanges: null,    // all
    highlight: false,
    features: [
      "Everything in Pro",
      "Unlimited live coins & legs",
      "All exchanges",
      "Highest API rate limits",
      "Priority human support",
      "Early access to new strategies",
    ],
  },
};

// Safe lookup — unknown/missing tier falls back to free so gating never crashes.
export function tierOf(user) {
  const t = (user && user.tier) || "free";
  return TIERS[t] || TIERS.free;
}

// Map a Stripe Price id back to {tier, interval}. Used by the webhook to know
// which plan a completed checkout bought. Returns null if no tier matches.
export function planFromPriceId(priceId) {
  if (!priceId) return null;
  for (const id of TIER_ORDER) {
    const t = TIERS[id];
    if (t.stripePriceIdMonthly && t.stripePriceIdMonthly === priceId) return { tier: id, interval: "month" };
    if (t.stripePriceIdAnnual && t.stripePriceIdAnnual === priceId) return { tier: id, interval: "year" };
  }
  return null;
}

export default TIERS;
