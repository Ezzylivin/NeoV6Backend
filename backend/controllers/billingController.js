// File: backend/controllers/billingController.js
// Stripe-ready billing scaffold. This is wired end-to-end EXCEPT for your own
// Stripe account data — it stays safely dormant until these env vars are set:
//
//   STRIPE_SECRET_KEY         sk_live_... or sk_test_...   (enables the API)
//   STRIPE_WEBHOOK_SECRET     whsec_...                    (verifies webhooks)
//   STRIPE_PRICE_TRADER_M / _TRADER_A / _PRO_M / _PRO_A / _WHALE_M / _WHALE_A
//                              price_...  (one per tier × interval; see tiers.js)
//   FRONTEND_URL              https://your-app  (checkout return URLs)
//
// Until STRIPE_SECRET_KEY + a tier's price id exist, checkout for that tier
// returns 503 with a clear message and the UI shows "Coming soon". Nothing here
// ever touches real money on its own — a human completes payment on Stripe's
// hosted page, and only Stripe's signed webhook flips a user's tier.
//
// The `stripe` npm package is imported LAZILY so the whole backend still boots
// if the dependency isn't installed yet.
import User from "../dbStructure/user.js";
import { TIERS, TIER_ORDER, planFromPriceId } from "../config/tiers.js";

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://neo-v6.vercel.app").replace(/\/$/, "");

// Lazily construct the Stripe client. Returns null (never throws) when the key
// or the package is missing, so callers can respond with a clean 503.
let _stripe = null;
async function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const mod = await import("stripe");
    const Stripe = mod.default || mod;
    _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
    return _stripe;
  } catch (e) {
    console.error("[billing] stripe package not installed:", e.message);
    return null;
  }
}

// Public shape of a tier for the Plans page — hides the raw env price ids and
// exposes only whether checkout is currently wired for that tier+interval.
function publicTier(t) {
  return {
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    blurb: t.blurb,
    priceMonthly: t.priceMonthly,
    priceAnnual: t.priceAnnual,
    trialDays: t.trialDays,
    liveEnabled: t.liveEnabled,
    maxLiveCoins: t.maxLiveCoins,
    maxLiveLegs: t.maxLiveLegs,
    exchanges: t.exchanges,
    highlight: t.highlight,
    features: t.features,
    checkout: {
      month: !!t.stripePriceIdMonthly,
      year: !!t.stripePriceIdAnnual,
    },
  };
}

/**
 * GET /api/billing/plans
 * The full catalog (for the Plans page) + the caller's current subscription.
 * `billingConfigured` tells the UI whether Stripe is live at all yet.
 */
export const getPlans = async (req, res) => {
  try {
    const plans = TIER_ORDER.map((id) => publicTier(TIERS[id]));
    const u = req.user || {};
    res.json({
      plans,
      billingConfigured: !!process.env.STRIPE_SECRET_KEY,
      current: {
        tier: u.tier || "free",
        subscriptionStatus: u.subscriptionStatus || null,
        subscriptionInterval: u.subscriptionInterval || null,
        currentPeriodEnd: u.currentPeriodEnd || null,
        manualOverride: !!u.tierManualOverride,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/billing/checkout   { tier, interval }
 * Creates a Stripe Checkout Session for a subscription and returns its hosted
 * URL. The browser redirects there; payment happens on Stripe, not here.
 */
export const createCheckout = async (req, res) => {
  try {
    const { tier, interval = "month" } = req.body || {};
    const plan = TIERS[tier];
    if (!plan || tier === "free") return res.status(400).json({ message: "Pick a paid plan." });

    const priceId = interval === "year" ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;
    const stripe = await getStripe();
    if (!stripe || !priceId) {
      return res.status(503).json({
        message:
          "Live checkout isn't switched on yet. Add your Stripe keys and this plan's price id to enable it.",
        billingConfigured: !!stripe,
      });
    }

    const user = req.user;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: String(user.id),
      customer: user.stripeCustomerId || undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email || undefined,
      metadata: { userId: String(user.id), tier, interval },
      subscription_data:
        plan.trialDays > 0 ? { trial_period_days: plan.trialDays } : undefined,
      allow_promotion_codes: true,
      success_url: `${FRONTEND_URL}/dashboard/plans?checkout=success`,
      cancel_url: `${FRONTEND_URL}/dashboard/plans?checkout=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("[billing] checkout error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/billing/portal
 * Opens the Stripe Customer Portal so a subscriber can change card / cancel.
 */
export const createPortal = async (req, res) => {
  try {
    const stripe = await getStripe();
    if (!stripe) return res.status(503).json({ message: "Billing isn't configured yet." });
    if (!req.user.stripeCustomerId) {
      return res.status(400).json({ message: "No subscription on file." });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: `${FRONTEND_URL}/dashboard/plans`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Resolve which tier a subscription is on from its first price id.
function tierFromSubscription(sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  return planFromPriceId(priceId); // { tier, interval } | null
}

/**
 * POST /api/billing/webhook  (mounted with a RAW body parser in app.js)
 * The ONLY path that changes a user's paid tier. Verifies Stripe's signature,
 * then syncs the user doc on subscription lifecycle events. Respects a manual
 * admin override: a comped tier is never downgraded by an automatic event.
 */
export const handleWebhook = async (req, res) => {
  const stripe = await getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return res.status(503).send("Billing not configured");

  let event;
  try {
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, sig, secret); // req.body = raw Buffer
  } catch (err) {
    console.error("[billing] webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const userId = s.client_reference_id || s.metadata?.userId;
        const tier = s.metadata?.tier;
        const interval = s.metadata?.interval || "month";
        if (userId && tier && TIERS[tier]) {
          await User.findByIdAndUpdate(userId, {
            $set: {
              tier,
              subscriptionInterval: interval,
              subscriptionStatus: "active",
              stripeCustomerId: s.customer || undefined,
              stripeSubscriptionId: s.subscription || undefined,
              tierManualOverride: false, // now Stripe-driven
            },
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const match = tierFromSubscription(sub);
        const user = await User.findOne({ stripeCustomerId: sub.customer });
        if (user && !user.tierManualOverride) {
          const set = {
            subscriptionStatus: sub.status,
            stripeSubscriptionId: sub.id,
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : undefined,
          };
          if (match) {
            set.tier = match.tier;
            set.subscriptionInterval = match.interval;
          }
          await User.updateOne({ _id: user._id }, { $set: set });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const user = await User.findOne({ stripeCustomerId: sub.customer });
        if (user && !user.tierManualOverride) {
          await User.updateOne(
            { _id: user._id },
            { $set: { tier: "free", subscriptionStatus: "canceled" } }
          );
        }
        break;
      }
      default:
        break; // ignore the rest
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[billing] webhook handler error:", err.message);
    res.status(500).send("handler error");
  }
};
