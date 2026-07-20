# Public demo

| Field | Value |
|-------|-------|
| Local | http://localhost:5173 |
| **Public** | **https://qsaquant.github.io/sendit/** |
| Repo | https://github.com/QSAQuant/sendit |
| Peel clip (silent loop asset, not the game) | https://qsaquant.github.io/sendit/lobby/peel-clip.svg |
| Icon | https://qsaquant.github.io/sendit/icon-64.svg |
| Redeploy | See `docs/deploy.md` |

## Controls (for BD playtests)
- **SEND** — join next fuse (Space); queues if mid-round
- **PAPER** OFF / HALF / FULL — bust cover on notional
- **HEAT 1× / 2×** — capped exposure (H key); 3% fee on extra
- **ASH** — auto-credited on bust (margin lost × 10%); next fuse only
- **PEEL 50%** — bank half (P)
- **CASH** — exit remaining; voids PAPER (Space while riding)
- Lanes **1 / 2 / 3** = SLOW / SEND / DEGEN
- Auto-send checkbox for hands-free flow

## Fairness strip
- Pre-round: commitment **hash** shown
- Post-snap: **seed** revealed; crash derived from seed + lane house edge
