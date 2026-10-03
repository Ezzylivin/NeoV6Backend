# NeoV6 — Real Limit-Order Execution: Build Scope

**Why this exists.** The validated edge only survives at ~0% effective cost
(Coinbase One / Binance.US **maker**). That economics is only real if live
trades are **post-only limit (maker) orders** — not market takers. Today the
live loop is *paper* (a single modeled fill) and "going live" is a manual
hand-off. This document scopes the deliberate build that turns the validated
strategy into real, maker-priced execution. **It moves real money — it must be
built and rolled out in stages, behind explicit per-step authorization.**

## Current state
- Simulator/validation model maker fills + per-side + Coinbase One (done).
- `COINBASE_ONE=true` zeroes live-*paper* fees globally (done).
- Live loop: paper only, no real exchange orders. No order lifecycle.

## Hard prerequisites (must all be true before a single real order)
1. The user's config is **ROBUST** in the eligibility registry (gate already exists).
2. The user is on a **live-enabled tier** (already gated).
3. A **Coinbase One** (or Binance.US 0%-maker) account is connected — otherwise the fee economics don't hold and the edge is gone.
4. Exchange API keys are **trade-only, never withdrawal** (enforced + documented).
5. Explicit, per-activation user confirmation (not a global flag).

## Phases
1. **Execution abstraction.** `ExecutionClient` interface: `place_limit`, `cancel`,
   `open_orders`, `fills`, `balances`. Implementations: `PaperExecution` (current
   behavior) and `CcxtExecution` (Coinbase Advanced / Binance.US via ccxt). The
   live loop talks to the interface, not to a hard-coded paper fill.
2. **Post-only limit placement.** Entries/exits as **post-only** limit orders at/near
   signal price. Define: time-in-force, how long to rest an unfilled order, repricing
   policy, and **cancel-if-signal-invalidates**. Critically: **model + measure the
   fill rate** — the edge assumed maker fills; unfilled limits = missed entries and
   change results.
3. **Order lifecycle & reconciliation.** Track open orders; poll fills; update
   positions from **actual** fills (not modeled); reconcile open orders/positions on
   restart; handle partial fills.
4. **Real fees from the exchange.** Read actual fills + fee from the venue and feed
   them into P&L, replacing the modeled fee — so paper assumptions are validated
   against reality.
5. **Safety stack.** Dry-run mode (log intended orders, send nothing); per-order max
   size; daily-loss + drawdown halts; the existing kill switch must cancel all open
   orders; rate-limit handling; exchange-outage fallback.
6. **Gating + activation.** Real sending only when all prerequisites hold, per a
   deliberate per-user, per-session activation with confirmation.

## Rollout (staged, each gated on the previous)
1. `CcxtExecution` in **dry-run** against the user's account (logs orders, sends none)
   — confirm order params, pricing, and would-be fills look right.
2. **Tiny real size** on ONE coin (e.g., $20 BTC), maker-only — measure realized
   **maker fill rate** and **actual fees vs the sim assumption**. If fills are poor or
   fees differ, the edge estimate is wrong → stop.
3. Scale to the validated roster only after (2) matches the model.

## Risks to respect
- Real money, irreversible fills.
- **Limit orders may not fill** — the single biggest threat to the validated numbers
  (the edge assumed maker fills; missed entries change everything).
- Coinbase One 0% is **capped (~$10k/mo volume)**; beyond it, fees return and the edge dies.
- Partial fills, repricing, slippage on marketable limits, exchange outages, rate limits.
- Forward paper must confirm the edge **before** real size, and (2) must confirm
  fill-rate/fees **before** scaling.

## Boundary
This is real-money automation. It will be built incrementally and will not send a
real order without explicit authorization at each stage; the validation gate and
the staged rollout above are the safeguards.
