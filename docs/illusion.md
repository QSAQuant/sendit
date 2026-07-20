# SENDIT — Master illusion kit

**Shipped:** 2026-07-20  
**Goal:** Degens treat SENDIT as a solvable puzzle. House tables stay +EV. RNG is never faked.

## Tabs in demo
| Tab | Job |
|-----|-----|
| PLAY | Loadout: lane · PAPER · HEAT · SNAP · SEND |
| TABLES | Fair π vs sold π, HEAT fee, ASH rate, SNAP odds |
| MYTHS | 4 named community systems (HALF CHAD, ASH LOOP, …) |
| TAPE | Rolling snap-band heatmap (pattern fallacy playground) |
| VERIFY | Recompute crash from seed/hash (auditor ego) |
| EV LAB | Napkin EV + shareable loadout codes |

## Loadout code
Format: `SI-{lane}{heat}-P{paper}-M{margin}-S{snap}{stake}`

Examples:
- `SI-R1-PO-M10-SX0` — SEND · 1× · no paper · margin 10
- `SI-R2-PH-M10-SK2` — SEND · HEAT2 · PAPER HALF · SNAP COOK $2
- `SI-D2-PF-M25-SM5` — DEGEN · HEAT2 · FULL · SNAP MOON $5

Lane: S=SLOW, R=SEND, D=DEGEN · Paper: O/H/F · Snap: X/D/C/K/M

## Hard rules
1. Publish the vig (fair vs sold).  
2. Never fake delay / near-miss / hidden RTP.  
3. Popular myths remain −EV on napkin.  
4. Verify must PASS for sealed rounds.

## Code
- `src/game/illusion.ts` — myths, heatmap, verify, EV lab, SNAP, codes  
- `src/main.ts` — UI wiring  
- Paytable math also in `docs/math.md`
