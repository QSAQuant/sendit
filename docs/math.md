# SENDIT — Math & product model

**Status:** Demo / pitch documentation. Production settlement must run on publisher RGS with lab cert.  
**Last updated:** 2026-07-20

## One-liner
SENDIT is classic crash **plus** priced side products: **PAPER** (bust cover), **ASH** (next-fuse fuel), **HEAT 2×** (capped exposure).

## Core crash (unchanged RNG)
| Lane | UI | House edge `e` | Instant bust | Target RTP |
|------|-----|----------------|--------------|------------|
| calm | SLOW | 3% | 1.5% | ~97% |
| rise | SEND | 4% | 3.0% | ~96% |
| spike | DEGEN | 5% | 5.0% | ~95% |

```
crash = max(1.00, floor(((1−e)/(1−u))·100)/100)
```
(+ instant-bust branch). Seed committed pre-round; revealed on snap.

---

## Rule 1 — HEAT 2× (fee on extra exposure)

| | |
|--|--|
| Levels | `1×` (default) or `2×` only |
| Margin `M` | Player posts this |
| Notional `N` | `N = L · M` |
| Fee | `fee = 0.03 · (L−1) · M` → **3% of M at 2×** |
| Ride | Wins/losses settle on **notional** still riding |
| UI name | **HEAT 2×** — never “leverage” in publisher decks |

Example: `M=10`, `L=2` → `N=20`, `fee=0.30`.

Code: `src/game/products.ts` → `heatFee`, `notionalOf`.

---

## Rule 2 — PAPER priced on notional

Optional cover bought **before** fuse. Premium on **N**, not M.

| Tier | α (refund on snap) | π (premium rate) | Premium |
|------|--------------------|------------------|---------|
| OFF | 0 | 0 | 0 |
| HALF | 0.5 | 0.35 | `0.35 · N` |
| FULL | 1.0 | 0.72 | `0.72 · N` |

**Claim:** if still holding at snap → pay `α · remainingNotional`.  
**Void:** full **CASH** sets `paperActive=false` (premium sunk).  
**PEEL:** does **not** void PAPER; cover stays on remaining notional.

With HEAT 2×, PAPER must use N or the player arb’s cheap cover on fat exposure.

Code: `paperPremium`, `paperClaim`, `settleBust`.

---

## Rule 3 — ASH on margin lost only

On snap while holding:

```
marginLost = remainingNotional / L
ashCredit  = 0.10 · marginLost
```

- ASH is **next-fuse-only**; expires if unused on the following round.  
- ASH applies toward **margin** on the next SEND (not fees/premium first — quote applies ash to margin).  
- Conceptual ash wager edge: lane `e + 2%` (demo accounting note; cash lane edge unchanged).

Never credit ASH on full notional — that would print fuel under HEAT 2×.

Code: `ashFromMarginLost`, `marginAtRisk`.

---

## Rule 4 — UI verbs

| Control | Job |
|---------|-----|
| SEND | Join fuse (queues if mid-round) |
| PAPER OFF/HALF/FULL | Buy cover |
| HEAT 1×/2× | Toggle exposure |
| ASH meter | Shows next-fuse fuel |
| PEEL 50% | Bank half notional × mult |
| CASH | Exit remaining; voids PAPER |

Quote line shows: `Ride N · heat fee · paper · ash · cash required`.

---

## Rule 5 — Pitch split

| Audience | Headline products | HEAT? |
|----------|-------------------|-------|
| Publishers (Silver Bullet / BGaming / OpenRGS) | PEEL + PAPER + fuse brand | Soft-pedal / omit from subject |
| Crypto / Telegram anchors | HEAT 2× + PAPER + ASH | Lead with HEAT |

See `outreach/emails.md` vs `outreach/crypto-anchor.md`.

---

## Send cost (cash debit)

```
totalDebit   = N + heatFee + paperPremium(N)   # escrow FULL notional
ashApplied   = min(ashAvailable, M)
cashRequired = totalDebit − ashApplied
```

**Why N not M:** If we only lock margin M but pay `N × mult` on cashout, HEAT 2× is strongly +EV for players (sim-proven). Full notional escrow keeps crash EV ≈ `−e · N` plus fees.

---

## Worked example

`M=10`, HEAT 2×, PAPER HALF:

| Item | Value |
|------|-------|
| Notional | 20 |
| Heat fee | 0.30 |
| Paper prem | 0.35×20 = 7.00 |
| Cash out | 17.30 |
| Snap while full hold | PAPER pays 0.5×20 = 10; ASH = 0.1×10 = 1 |
| Cash @ 2.00× before snap | Payout 40; PAPER void; no ASH |

---

## Cert / RG notes

- One crash RNG; PAPER/HEAT/ASH are **side rules / fees / bonuses** with fixed tables.  
- No dynamic “AI odds.”  
- PAPER once per round; HEAT capped at 2×.  
- ASH expires in one round — not a bankroll printer.  
- Production: server-authoritative seeds + publisher RGS.
