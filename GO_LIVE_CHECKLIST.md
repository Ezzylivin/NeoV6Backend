# NeoV6 — Go-Live Checklist

Honest status of what stands between here and a real launch. Legend:
✅ done · 🟡 needs your config (code is ready) · 🔴 not started / needs a decision

---

## 1. Trading readiness — 🔴 THE blocker (do not skip)
Real money should not move until the strategy proves itself on paper.
- 🔴 Let the fleet **paper-trade for weeks** and accumulate a real track record
  (target **30–60+ closed trades per coin**, not open positions).
- 🔴 Clear **5/5 on the in-app Go-Live Readiness** scorecard (Fleet page): validated
  out-of-sample + cost-stress, ≥10 closed trades, drift on-track, positive net P&L,
  profit factor ≥ 1.2. It currently reads 1/5.
- 🔴 Decide how "live" actually executes: today it's a **manual hand-off** (the app
  places no real orders). Automating real exchange orders is a separate, serious
  build with its own risk and testing.
> Reminder from the research: entry signals showed no durable edge; only the
> trend-ride *exit* generalized, and it still needs live-forward proof. Treat the
> readiness gate as real.

## 2. Email (verification, password reset, alerts) — 🟡 config only
- ✅ Mailer code is complete (`backend/utils/mailer.js`); `nodemailer` now in
  package.json so it installs on deploy.
- 🟡 Set these env vars on Render, then verification/reset/alerts work:
  ```
  SMTP_HOST=            # e.g. smtp.postmarkapp.com, smtp.sendgrid.net, smtp.resend.com
  SMTP_PORT=587         # 587 STARTTLS, or 465 SSL
  SMTP_USER=
  SMTP_PASS=
  MAIL_FROM="NeoV6 <no-reply@yourdomain.com>"
  ```
- 🟡 Verify SPF/DKIM for your sending domain so mail doesn't land in spam.
- 🟡 Test: register a new account → confirm the verification email arrives and the
  link verifies; test "forgot password".

## 3. Billing / Stripe — 🟡 config only
- ✅ Checkout + webhook + customer portal wired; `stripe` in package.json; Plans
  page live with 6-months-free annual pricing.
- 🟡 Follow `BILLING_AND_ADMIN.md` §2: add `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, the six `STRIPE_PRICE_*` ids, and `FRONTEND_URL`.
- 🟡 Run a full **test-mode** checkout → confirm the webhook flips the user's tier →
  confirm the customer portal cancels correctly.

## 4. Domain & URLs — 🔴
- 🔴 Point a **custom domain** at Vercel (you're on the `*.vercel.app` preview URL).
- 🟡 Set `FRONTEND_URL` (backend) and `ALLOWED_ORIGINS` to the real domain so
  Stripe return URLs, email links, and CORS are correct.

## 5. Legal — 🟡 drafts shipped, need review
- ✅ Terms, Privacy, and Risk Disclosure pages live at `/legal` and linked from the
  signup form and the Plans page; signup shows a consent line.
- 🔴 Fill the `[bracketed]` placeholders in `src/pages/Legal.jsx` (company, jurisdiction,
  contact) and have a **qualified attorney review**. Selling automated-trading
  software to U.S. users may carry registration/compliance obligations — get advice.

## 6. Admin & accounts — ✅ / 🟡
- ✅ `ADMIN_EMAILS` promotes owner accounts to admin/whale; admins land on Admin
  Control and are excluded from paying/MRR counts.
- 🟡 Confirm your real owner email is in `ADMIN_EMAILS` on Render.

## 7. Security & ops — 🟡
- ✅ Engine behind an internal key; JWT auth; API keys encrypted at rest.
- 🟡 Confirm secrets are set only in env (never committed); rotate anything shared
  during development.
- 🟡 Set up basic uptime monitoring / error alerting for the Render backend and the
  engine. Confirm the stale-chunk auto-reload behaves after each deploy.
- 🟡 Make sure users grant exchange API keys **trade-only, never withdrawal**.

---

## Suggested launch order
1. Keep the fleet paper-trading; watch the readiness scorecard climb (§1).
2. In parallel, do the config plumbing: email (§2), domain (§4), Stripe test mode (§3).
3. Fill in + lawyer-review the legal docs (§5).
4. **Soft-launch** to a few users (free or discounted) while the track record proves out.
5. Only enable live real-money execution after 5/5 readiness and a deliberate decision on §1.
