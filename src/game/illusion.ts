import {
  ASH_RATE,
  HEAT_FEE_RATE,
  PAPER_TIERS,
  ashFromMarginLost,
  heatFee,
  notionalOf,
  paperPremium,
  type HeatLev,
  type PaperTier,
} from "./products";
import { generateCrashPoint, hashSeed, mulberry32 } from "./rng";
import { RIDGES, type RidgeId } from "./ridges";

export { ASH_RATE, HEAT_FEE_RATE };

/** Snap-band side lottery */
export type SnapBand = "off" | "dust" | "chop" | "cook" | "moon";

export const SNAP_BANDS: Record<
  Exclude<SnapBand, "off">,
  { min: number; max: number; odds: number; label: string; blurb: string }
> = {
  dust: {
    min: 1.0,
    max: 1.2,
    odds: 4.2,
    label: "DUST",
    blurb: "1.00–1.20×",
  },
  chop: {
    min: 1.2,
    max: 2.0,
    odds: 2.6,
    label: "CHOP",
    blurb: "1.20–2.00×",
  },
  cook: {
    min: 2.0,
    max: 5.0,
    odds: 2.8,
    label: "COOK",
    blurb: "2.00–5.00×",
  },
  moon: {
    min: 5.0,
    max: Infinity,
    odds: 4.4,
    label: "MOON",
    blurb: "5.00×+",
  },
};

export function snapBandOf(crashAt: number): Exclude<SnapBand, "off"> {
  if (crashAt < 1.2) return "dust";
  if (crashAt < 2) return "chop";
  if (crashAt < 5) return "cook";
  return "moon";
}

export function snapPays(
  crashAt: number,
  band: SnapBand,
  stake: number,
): number {
  if (band === "off" || stake <= 0) return 0;
  const b = SNAP_BANDS[band];
  const hit = crashAt >= b.min && crashAt < b.max;
  return hit ? Math.floor(stake * b.odds * 100) / 100 : 0;
}

/**
 * Fair PAPER π if player holds to target T then cashes (or busts).
 * P(survive to T) ≈ (1−e)/T → P(bust) ≈ 1 − (1−e)/T
 * fair π ≈ α · P(bust)
 */
export function fairPaperPi(
  edge: number,
  alpha: number,
  targetT: number,
): number {
  const t = Math.max(1.01, targetT);
  const pBust = 1 - (1 - edge) / t;
  return Math.max(0, Math.min(1, alpha * pBust));
}

export type RoundRecord = {
  round: number;
  seed: number;
  seedHash: string;
  crashAt: number;
  ridge: RidgeId;
};

export function verifyRound(r: RoundRecord): {
  ok: boolean;
  recomputed: number;
  hashOk: boolean;
} {
  const hashOk = hashSeed(r.seed, r.round) === r.seedHash;
  const rng = mulberry32(r.seed);
  const recomputed = generateCrashPoint(rng, RIDGES[r.ridge]);
  const ok = hashOk && Math.abs(recomputed - r.crashAt) < 0.001;
  return { ok, recomputed, hashOk };
}

export function heatmap(history: number[]) {
  const counts = { dust: 0, chop: 0, cook: 0, moon: 0 };
  for (const c of history) counts[snapBandOf(c)]++;
  const n = history.length || 1;
  return (Object.keys(counts) as (keyof typeof counts)[]).map((k) => ({
    id: k,
    label: SNAP_BANDS[k].label,
    count: counts[k],
    pct: Math.round((counts[k] / n) * 100),
  }));
}

export type Loadout = {
  ridge: RidgeId;
  heat: HeatLev;
  paper: PaperTier;
  margin: number;
  snap: SnapBand;
  snapStake: number;
};

/** Compact share code e.g. SI-R2-PH-M10-SK2 */
export function encodeLoadout(l: Loadout): string {
  const r = l.ridge === "calm" ? "S" : l.ridge === "spike" ? "D" : "R";
  const p = l.paper === "half" ? "H" : l.paper === "full" ? "F" : "O";
  let s = "X0";
  if (l.snap !== "off") {
    const ch =
      l.snap === "dust"
        ? "D"
        : l.snap === "chop"
          ? "C"
          : l.snap === "cook"
            ? "K"
            : "M";
    s = `${ch}${Math.min(99, Math.floor(l.snapStake))}`;
  }
  return `SI-${r}${l.heat}-P${p}-M${l.margin}-S${s}`;
}

export function decodeLoadout(code: string): Loadout | null {
  const m = code
    .trim()
    .toUpperCase()
    .match(/^SI-([SRD])([12])-P([OHF])-M(\d{1,4})-S([XDKCM])(\d{1,2})$/);
  if (!m) return null;
  const ridge: RidgeId =
    m[1] === "S" ? "calm" : m[1] === "D" ? "spike" : "rise";
  const heat = Number(m[2]) as HeatLev;
  const paper: PaperTier =
    m[3] === "H" ? "half" : m[3] === "F" ? "full" : "off";
  const margin = Math.max(1, Number(m[4]));
  let snap: SnapBand = "off";
  const snapChar = m[5];
  if (snapChar === "D") snap = "dust";
  else if (snapChar === "C") snap = "chop";
  else if (snapChar === "K") snap = "cook";
  else if (snapChar === "M") snap = "moon";
  const snapStake = snap === "off" ? 0 : Math.max(1, Number(m[6]));
  return { ridge, heat, paper, margin, snap, snapStake };
}

export function loadoutTag(opts: {
  paper: PaperTier;
  heat: HeatLev;
  snap?: SnapBand;
}): string {
  const parts: string[] = [];
  if (opts.paper !== "off") parts.push(PAPER_TIERS[opts.paper].label);
  if (opts.heat === 2) parts.push("HEAT2");
  if (opts.snap && opts.snap !== "off")
    parts.push(SNAP_BANDS[opts.snap].label);
  return parts.length ? parts.join("·") : "FLAT";
}

export type Myth = {
  id: string;
  name: string;
  blurb: string;
  claim: string;
};

export const MYTHS: Myth[] = [
  {
    id: "halfchad",
    name: "HALF CHAD",
    blurb: "PAPER HALF · ride to 2× · never peel",
    claim: "HALF underprices 2× busts — print cover",
  },
  {
    id: "ashloop",
    name: "ASH LOOP",
    blurb: "Snap → ash → HEAT2 next fuse",
    claim: "Playing with house money after snap",
  },
  {
    id: "coldtape",
    name: "COLD TAPE",
    blurb: "Three DUST → MOON snap + HEAT2",
    claim: "Bands mean-revert — fade the dust",
  },
  {
    id: "voidvig",
    name: "VOID VIG",
    blurb: "Buy FULL · cash @ 1.4× always",
    claim: "Force house to keep the premium",
  },
];

export type EvLabResult = {
  notional: number;
  heatFee: number;
  paperPrem: number;
  snapStake: number;
  totalOutlay: number;
  fairPi: number;
  soldPi: number;
  paperVigPts: number;
  estEvPctOfMargin: number;
  note: string;
};

export function runEvLab(opts: {
  margin: number;
  ridge: RidgeId;
  heat: HeatLev;
  paper: PaperTier;
  targetT: number;
  snap: SnapBand;
  snapStake: number;
}): EvLabResult {
  const e = RIDGES[opts.ridge].houseEdge;
  const N = notionalOf(opts.margin, opts.heat);
  const fee = heatFee(opts.margin, opts.heat);
  const prem = paperPremium(N, opts.paper);
  const alpha = PAPER_TIERS[opts.paper].alpha;
  const soldPi = PAPER_TIERS[opts.paper].pi;
  const fairPi = fairPaperPi(e, alpha || 0, opts.targetT);
  const paperVigPts =
    opts.paper === "off" ? 0 : Math.round((soldPi - fairPi) * 1000) / 10;
  const snapStake = opts.snap === "off" ? 0 : opts.snapStake;
  const totalOutlay = opts.margin + fee + prem + snapStake;

  const mainDrag = e * N;
  const paperDrag =
    opts.paper === "off" ? 0 : Math.max(0, (soldPi - fairPi) * N);
  const snapDrag = snapStake * 0.17;
  const ashComfort = ashFromMarginLost(opts.margin) * 0.25;
  const ev = -mainDrag - fee - paperDrag - snapDrag + ashComfort;
  const estEvPctOfMargin =
    Math.round((ev / Math.max(1, opts.margin)) * 1000) / 10;

  return {
    notional: N,
    heatFee: fee,
    paperPrem: prem,
    snapStake,
    totalOutlay,
    fairPi: Math.round(fairPi * 1000) / 1000,
    soldPi,
    paperVigPts,
    estEvPctOfMargin: Math.min(0, estEvPctOfMargin),
    note:
      estEvPctOfMargin >= -1.5
        ? "Close to flat — volume still favors house"
        : "Napkin EV negative — the puzzle is the product",
  };
}
