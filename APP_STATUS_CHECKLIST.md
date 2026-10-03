# NeoV6 — Full App Status Checklist (2026-10-03)

Legend: ✅ done · 🟡 built, needs your config/decision · ⏳ in progress (time) · 🔴 not built / still needed

---

## 1. Core app & infrastructure
- ✅ Three repos (ML engine, Node backend, frontend) wired + deploying
- ✅ Frontend → Vercel (auto), Backend → Render (auto, but laggy — sometimes needs a manual deploy), Engine → manual restart
- ✅ JWT auth, protected routes, guest routes
- ✅ Stale-chunk auto-recovery (no more black screens after deploy)
- 🔴 Custom domain (still on the `*.vercel.app` preview URL)
- 🟡 `FRONTEND_URL` / `ALLOWED_ORIGINS` set to the real domain (after you have one)
- 🟡 Uptime monitoring / error alerting (none yet)

## 2. Trading engine & strategy — the heart
- ✅ Fleet orchestration (multi-coin long + optional daily short)
- ✅ Validated trend-ride exit (hold-to-flip + ATR stop)
- ✅ Risk-breaker stale-peak bug fixed (small fleets trade)
- ✅ Hardened validation gate (min trades + expectancy/PF margin + 25–35% OOS holdout + cost stress + cross-coin generalization)
- ✅ Realistic per-side fees (maker longs / Kraken shorts), env-tunable
- ✅ Pyramids capped 1–2 legs
- ✅ Entry-signal testing (regime / trend / momentum) in the gate
- ✅ Full 9-coin universe (BTC, ETH, SOL, XRP, DOGE, ADA, SUI, PEPE, SHIB)
- ✅ Recalibration — manual button + automated daily + fee profiles (Default/Coinbase One/Binance.US/Kraken/real)
- ✅ Research sweep — manual button + automated weekly (ranks best configs across all coins/entries/exits)
- ✅ Self-learning ledger (trains on the fleet's own closed trades)
- 🟡 **EDGE STATUS (critical):** a real, validated edge EXISTS **only at ~0% fees** (Coinbase One / Binance.US maker) — regime & momentum on BTC/ETH/SOL/XRP clear STRICT. At real retail fees, nothing clears. This is the central truth of the whole product.
- ✅ Operating fee default = 0% (Coinbase One) — "use 0% venues until profits absorb costs"
- ⏳ **Forward paper proof** — fleet re-ignited on the validated roster (BTC/ETH/SOL/XRP long, fee-free); now accumulating a live-forward track record. **Needs weeks.**
- 🔴 **Go-Live readiness: NOT met** — scorecard needs ~30–60+ closed trades/coin, positive net P&L, profit factor ≥ 1.2, drift on-track. Currently ~0 closed trades.

## 3. Live execution (turning paper into real money)
- ✅ Stage 1 — dry-run order params (verified on Coinbase + Binance.US, correct per-venue price/precision, post-only, nothing sent)
- ✅ Stage 2 — paper lifecycle (proven by the validated simulator: place → flip/SL → close)
- 🔴 Stage 3 — one real tiny post-only order (YOU run it; script ready in `STAGE3_FIRST_LIVE_ORDER.md`). **You said: not ready yet.**
- 🔴 Stage 4 — wire the fleet's live entries/exits through `execution.CcxtExecution` at small real size (only after a good Stage 3)
- 🔴 Live loop still places NO real orders — "go live" is a manual hand-off until Stage 4
- ❓ Open question only a real order answers: **do post-only (maker) limits actually fill?** The edge assumes they do.

## 4. Subscription / monetization
- ✅ Tier model (free / trader / pro / whale) + capital/feature gating
- ✅ Plans page (6-months-free annual pricing, current-plan badge)
- ✅ Admin can assign/comp tiers; admins excluded from paying/MRR
- 🟡 Stripe scaffold wired but DORMANT — needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs, webhook endpoint (see `BILLING_AND_ADMIN.md`)
- 🟡 Product decision: make Coinbase One / Binance.US (0% venue) the basis of the live tier ("trade the validated strategy fee-free")
- 🔴 Real paid subscriptions can't be taken until Stripe is configured

## 5. Admin control plane
- ✅ Role-gated admin page (admins land here); user directory + inline tier/role edit
- ✅ Overview stats + est. MRR
- ✅ Global kill switch
- ✅ Validation/recalibration controls (level + fee profile)
- ✅ Research controls (ranked results)
- ✅ Execution dry-run card
- ✅ Broadcast email (multi-select users)
- ✅ Settings link

## 6. Email
- ✅ Mailer code complete + `nodemailer` dependency added
- 🔴 **SMTP not configured** — verification, password reset, trade alerts, and admin broadcast all silently no-op until you set `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` (+ SPF/DKIM)

## 7. Accounts & onboarding
- ✅ Register / login / verify-email / forgot-password flows (verify + reset need SMTP to actually send)
- ✅ Forced first-login guided tour (once per account)
- ✅ Settings page revamped (profile, subscription card, wallet, exchange keys, admin link)
- ✅ Owner auto-admin via `ADMIN_EMAILS` (your account is admin/whale)
- ✅ Exchange API-key storage (encrypted, trade-only intended)

## 8. Legal & compliance
- ✅ Terms, Privacy, Risk Disclosure pages live (`/legal`), linked from signup + Plans, with consent line
- 🔴 Fill the `[bracketed]` placeholders (company, jurisdiction, contact)
- 🔴 Attorney review — and advice on whether selling automated-trading software to US users triggers registration/compliance obligations

---

## Critical path to a real launch (in order)
1. ⏳ **Let the forward paper fleet build a track record → hit 5/5 readiness** (weeks). Nothing else matters if the edge doesn't hold forward.
2. 🔴 **Stage 3** — one tiny real order to confirm maker fills at ~0% fee (you run it when ready).
3. 🔴 **Stage 4** — wire live execution, small real size, watch live vs paper.
4. 🟡 **Config**: SMTP (email), custom domain + URLs, Stripe (billing).
5. 🔴 **Legal**: fill placeholders + attorney/compliance review.
6. 🚀 **Soft launch** to a few users (free/discounted) while the track record proves out.

## One-line honest summary
The machine is built, hardened, and honest — it found that the edge is real **only fee-free**, and it's now forward-proving that on paper. What stands between here and launch is **time (the track record), one real order to confirm fills, and configuration (email/domain/Stripe) + legal review** — not more features.
