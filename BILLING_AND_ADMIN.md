# NeoV6 — Subscription Billing & Admin Runbook

The product rule: **paper trading is free and unlimited for everyone, forever.**
Paid tiers exist only to unlock **live trading** (which itself only activates
after a strategy passes Strategy-Lab validation). No per-trade fee, flat price.

Tier catalog lives in **one** place: `backend/config/tiers.js`. Change a price or
a limit there and the Plans page, the admin panel, Stripe mapping, and the live
gate all update together.

| Tier   | Price (mo / yr) | Live? | Live coins | Live legs | Exchanges |
|--------|-----------------|-------|-----------|-----------|-----------|
| Free   | $0              | no    | —         | —         | —         |
| Trader | $29 / $23       | yes   | 3         | 2         | 1         |
| Pro ⭐  | $79 / $63       | yes   | 8         | 5         | 3         |
| Whale  | $199 / $159     | yes   | ∞         | ∞         | all       |

---

## 1. Become admin (no DB editing needed)

Set this env var on the **backend** (Render) and redeploy / restart:

```
ADMIN_EMAILS=eric.dickerson@ionos.com
```

Any email listed here is auto-promoted to `role:admin` + `tier:whale` on their
next register/login. An **Admin** link then appears in the header, and
`/dashboard/admin` lets you manage every user, comp tiers, and hit the global
kill switch. (Comma-separate for multiple owners.)

## 2. Turn on Stripe (when you're ready to charge)

Everything is wired; it stays dormant until these backend env vars exist:

```
STRIPE_SECRET_KEY=sk_live_...        # or sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...      # from the webhook you create in step 2c
FRONTEND_URL=https://<your-vercel-domain>   # checkout return URLs

# One Stripe Price id per tier × interval (create as recurring subscriptions):
STRIPE_PRICE_TRADER_M=price_...   STRIPE_PRICE_TRADER_A=price_...
STRIPE_PRICE_PRO_M=price_...      STRIPE_PRICE_PRO_A=price_...
STRIPE_PRICE_WHALE_M=price_...    STRIPE_PRICE_WHALE_A=price_...
```

a. In Stripe → **Products**, create Trader / Pro / Whale, each with a monthly
   and an annual recurring Price. Paste the `price_...` ids above. (Match the
   $ amounts to `tiers.js` or just edit `tiers.js` to match Stripe.)
b. `npm install` already pulls `stripe` (added to package.json) on deploy.
c. In Stripe → **Developers → Webhooks**, add an endpoint:
   `https://<your-backend>/api/billing/webhook`
   Subscribe to: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

Until configured, the Plans page shows the catalog with "Coming soon" buttons
and a friendly banner — paper trading is unaffected.

### How a purchase flows
Browser → `POST /api/billing/checkout` → Stripe hosted checkout → user pays on
Stripe → Stripe's **signed** webhook → backend flips the user's `tier`. The app
never charges a card itself. Admin-comped tiers (`tierManualOverride`) are never
overwritten by a webhook.

## 3. Admin API (all require role:admin)
- `GET  /api/admin/overview` — totals, per-tier counts, est. MRR
- `GET  /api/admin/users?q=&tier=&role=&page=` — directory
- `PATCH /api/admin/users/:id` `{ tier?, role?, subscriptionStatus? }`
- `POST /api/admin/killswitch` `{ on }` — halt ALL fleets' new entries

Guard rails: you can't demote yourself, and the last admin can't be removed.
