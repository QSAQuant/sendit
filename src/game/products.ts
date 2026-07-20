/**
 * SENDIT side products — PAPER / ASH / HEAT
 * Rules locked:
 * 1) HEAT fee on extra exposure only
 * 2) PAPER priced on notional (not margin)
 * 3) ASH credited on margin lost only
 * 4) UI name is HEAT 2× (not "leverage")
 * 5) Publisher pitch soft-pedals HEAT; crypto-anchor leads with it
 */

export type PaperTier = "off" | "half" | "full";
export type HeatLev = 1 | 2;

/** 3% fee on (L-1)*margin → 3% of margin at 2× */
export const HEAT_FEE_RATE = 0.03;
/** Bust → next-fuse-only fuel as % of margin lost (fees/prem discount only) */
export const ASH_RATE = 0.08;
/** Demo note: ash wagers conceptually carry +2% edge vs cash lane */
export const ASH_EDGE_BUMP = 0.02;

export const PAPER_TIERS: Record<
  PaperTier,
  { alpha: number; pi: number; label: string; blurb: string }
> = {
  off: { alpha: 0, pi: 0, label: "OFF", blurb: "No cover" },
  half: {
    alpha: 0.5,
    pi: 0.35,
    label: "HALF",
    blurb: "50% notional back on snap",
  },
  full: {
    alpha: 1,
    // Must clear fair π for longer holds (~0.69 at T=3 on SEND). 0.55 was player-+EV in sims.
    pi: 0.72,
    label: "FULL",
    blurb: "100% notional back on snap",
  },
};

export function notionalOf(margin: number, lev: HeatLev): number {
  return margin * lev;
}

export function heatFee(margin: number, lev: HeatLev): number {
  if (lev <= 1) return 0;
  return floor2(HEAT_FEE_RATE * (lev - 1) * margin);
}

/** PAPER premium — always on notional */
export function paperPremium(notional: number, tier: PaperTier): number {
  return floor2(PAPER_TIERS[tier].pi * notional);
}

/** PAPER claim on bust — alpha × remaining notional still riding */
export function paperClaim(remainingNotional: number, tier: PaperTier): number {
  return floor2(PAPER_TIERS[tier].alpha * remainingNotional);
}

/** ASH from margin lost only (never from full notional) */
export function ashFromMarginLost(marginLost: number): number {
  return floor2(ASH_RATE * marginLost);
}

export function marginAtRisk(remainingNotional: number, lev: HeatLev): number {
  return floor2(remainingNotional / lev);
}

export type SendQuote = {
  margin: number;
  lev: HeatLev;
  notional: number;
  heatFee: number;
  paperTier: PaperTier;
  paperPremium: number;
  ashApplied: number;
  cashRequired: number;
  totalDebit: number;
};

export function quoteSend(opts: {
  margin: number;
  lev: HeatLev;
  paperTier: PaperTier;
  ashAvailable: number;
}): SendQuote {
  const margin = Math.max(1, Math.floor(opts.margin));
  const lev = opts.lev;
  const N = notionalOf(margin, lev);
  const fee = heatFee(margin, lev);
  const prem = paperPremium(N, opts.paperTier);
  // CRITICAL: escrow full notional. Paying N×mult while only locking M makes HEAT +EV for players.
  const totalDebit = floor2(N + fee + prem);
  // ASH may only discount fees+premium — never notional escrow (sim: dollar ash vs N×mult is +EV).
  const ashApplied = Math.min(opts.ashAvailable, floor2(fee + prem));
  const cashRequired = floor2(totalDebit - ashApplied);
  return {
    margin,
    lev,
    notional: N,
    heatFee: fee,
    paperTier: opts.paperTier,
    paperPremium: prem,
    ashApplied,
    cashRequired,
    totalDebit,
  };
}

export type BustSettlement = {
  marginLost: number;
  paperPay: number;
  ashCredit: number;
};

export function settleBust(opts: {
  remainingNotional: number;
  lev: HeatLev;
  paperTier: PaperTier;
  paperActive: boolean;
}): BustSettlement {
  const marginLost = marginAtRisk(opts.remainingNotional, opts.lev);
  const paperPay =
    opts.paperActive && opts.paperTier !== "off"
      ? paperClaim(opts.remainingNotional, opts.paperTier)
      : 0;
  const ashCredit = ashFromMarginLost(marginLost);
  return { marginLost, paperPay, ashCredit };
}

function floor2(n: number) {
  return Math.floor(n * 100) / 100;
}
