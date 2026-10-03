# Stage 3 — First Real Order (YOU run this, not Claude)

Stage 1 (dry-run order params) ✅ and Stage 2 (paper lifecycle) ✅ are done. The
only thing a backtest can't prove is whether a **post-only (maker) limit order
actually fills** on a live book — and that answer decides whether the 0%-fee edge
is real. The only way to learn it is one tiny real order.

**Claude does not place real trades.** This step moves real money and uses your
exchange keys, so you run it. Below is a self-contained script and the exact
decision rule.

## Prerequisites (do all of these first)
1. **Coinbase One** (or Binance.US) account active — so maker fees are ~0%. Without
   it the edge is gone and this test is pointless.
2. **API keys that are TRADE-ONLY** — withdrawals DISABLED on the key. Double-check
   this in the exchange's API settings. Never use a key that can withdraw.
3. Have **a few dollars** of USD in the account. Use **tiny** size ($5–$10).
4. Install ccxt in the engine venv if needed: `/root/venv/bin/pip install ccxt`.

## The script — `stage3_first_order.py`
Place it in `/root/Project/ML/`, set the two env vars, run it. It places ONE
post-only limit BUY a hair below best bid (so it rests as **maker**), waits up to
90s, reports whether it filled and at what fee, and **cancels if unfilled**.

```python
import os, time, ccxt

EXCHANGE = os.getenv("STAGE3_EXCHANGE", "coinbase")   # "coinbase" or "binanceus"
SYMBOL   = os.getenv("STAGE3_SYMBOL", "BTC/USD")
USD      = float(os.getenv("STAGE3_USD", "5"))         # keep tiny
API_KEY  = os.environ["STAGE3_KEY"]                     # trade-only key
SECRET   = os.environ["STAGE3_SECRET"]

ex = getattr(ccxt, EXCHANGE)({"apiKey": API_KEY, "secret": SECRET, "enableRateLimit": True})
ex.load_markets()
t = ex.fetch_ticker(SYMBOL)
bid = float(t["bid"])
# rest INSIDE the book as a maker: 0.05% below best bid for a buy
price = float(ex.price_to_precision(SYMBOL, bid * 0.9995))
amount = float(ex.amount_to_precision(SYMBOL, USD / price))
print(f"Placing POST-ONLY BUY {amount} {SYMBOL} @ {price} (~${USD}) on {EXCHANGE}")

order = ex.create_order(SYMBOL, "limit", "buy", amount, price, {"postOnly": True})
oid = order["id"]
print("order id:", oid)

filled = False
for _ in range(18):                      # ~90s
    time.sleep(5)
    o = ex.fetch_order(oid, SYMBOL)
    print("status:", o["status"], "filled:", o.get("filled"), "fee:", o.get("fee"))
    if o["status"] in ("closed", "filled") and (o.get("filled") or 0) > 0:
        filled = True
        break

if not filled:
    ex.cancel_order(oid, SYMBOL)
    print("NOT FILLED in 90s -> cancelled. (Maker limits often wait; try again or widen the offset.)")
else:
    o = ex.fetch_order(oid, SYMBOL)
    fee = o.get("fee") or {}
    print(f"FILLED. avg price {o.get('average')}, fee {fee.get('cost')} {fee.get('currency')}")
    print("Fee as % of notional:", (float(fee.get('cost',0)) / (float(o.get('average') or price)*float(o.get('filled') or amount)) * 100) if o.get('filled') else "n/a")
```

Run it:
```bash
cd /root/Project/ML && STAGE3_EXCHANGE=coinbase STAGE3_SYMBOL=BTC/USD STAGE3_USD=5 \
  STAGE3_KEY=... STAGE3_SECRET=... /root/venv/bin/python stage3_first_order.py
```

## The decision rule (this is the whole point)
- **Filled as maker at ~0% fee** → the edge's core assumption holds. Proceed to
  Stage 4 (scale): wire the fleet's live entries/exits through
  `execution.CcxtExecution` (it already exists, triple-gated) and run small real
  size on BTC/ETH/SOL/XRP, watching the live track record vs the paper model.
- **Didn't fill (maker limit skipped by the market)** → this is the real risk the
  plan warned about. The validated edge assumed maker fills; if they don't fill,
  missed entries change the results. Options: rest the order longer, widen the
  offset (but verify it's still maker), or accept that a slice of entries are
  missed and re-validate with that fill-rate.
- **Filled but fee wasn't ~0** → your account isn't getting Coinbase One / 0%-maker
  pricing. Fix the account/tier before trusting the 0%-fee validation.

## Guardrails
- Tiny size, one coin, one order. Cancel anything that doesn't fill.
- Trade-only keys, withdrawals off.
- Do this only after the forward paper fleet has shown a sane track record.
- `EXECUTION_LIVE` and real keys stay OFF in the engine's normal config — this
  script is a deliberate, manual, one-off. The fleet does not auto-send real
  orders until Stage 4 is explicitly built and enabled.
