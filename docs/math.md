# SENDIT — Demo math model

**Status:** Demo / pitch documentation. Production settlement must run on publisher RGS with lab cert.

## Summary
| Lane | UI | House edge | Instant bust P | Growth (visual) | Target RTP |
|------|-----|------------|----------------|-----------------|------------|
| calm | SLOW | 3% | 1.5% | slower climb | ~97% |
| rise | SEND | 4% | 3.0% | standard | ~96% |
| spike | DEGEN | 5% | 5.0% | savage climb | ~95% |

RTP ≈ `1 − houseEdge` before discrete rounding. Instant bust at `1.00×` is part of the edge profile.

## Crash point (classic crash transform)
Given `u ~ Uniform(0,1)` from seeded PRNG (excluding instant-bust branch):

```
crash = max(1.00, floor( ((1 - houseEdge) / (1 - u)) * 100 ) / 100)
```

This is the standard “provably fair style” inverse transform used in crash demos. Exact production curve is negotiated with the publisher math team.

## Seeding (demo)
1. At countdown start, generate 32-bit `seed`.
2. Publish `hash = hex(FNV-1a(seed || roundMeta))` in the UI **before** the fuse flies.
3. Derive crash with `mulberry32(seed)` + lane config when the round arms.
4. On snap, reveal `seed`. Anyone can recompute crash from seed + lane params.

**Demo caveat:** client-side RNG is for transparency UX only. Live money requires server-authoritative seeds on the publisher stack.

## Session throughput (operator pitch)
- Always-on fuse drops (~2.2s countdown + fly + ~1.1s snap hold)
- High bets/minute vs slots
- PEEL 50% increases decision density without leaving the round

## Responsible gaming (v1 surface)
- Auto-send toggle (player opt-in)
- Manual PEEL / CASH always available while riding
- Production: add loss limits / session timers under publisher RG toolkit
