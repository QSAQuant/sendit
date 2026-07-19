import type { RidgeConfig } from "./ridges";

/** Mulberry32 — deterministic PRNG for demo fairness display */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromTime(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

/** FNV-1a 32-bit → 8-char hex commitment */
export function hashSeed(seed: number, round: number): string {
  let h = 0x811c9dc5;
  const s = `${seed.toString(16)}:r${round}:sendit`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function generateCrashPoint(rng: () => number, ridge: RidgeConfig): number {
  if (rng() < ridge.instantBust) return 1.0;
  const r = rng();
  const point = (1 - ridge.houseEdge) / (1 - r);
  return Math.max(1.0, Math.floor(point * 100) / 100);
}
