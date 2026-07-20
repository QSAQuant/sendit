/**
 * Monte Carlo house PnL for SENDIT product stack.
 * Mirrors src/game rng + products + snap tables.
 * Run: node scripts/simulate-house.mjs
 */

const RIDGES = {
  calm: { houseEdge: 0.03, instantBust: 0.015 },
  rise: { houseEdge: 0.04, instantBust: 0.03 },
  spike: { houseEdge: 0.05, instantBust: 0.05 },
};

const PAPER = {
  off: { alpha: 0, pi: 0 },
  half: { alpha: 0.5, pi: 0.35 },
  full: { alpha: 1, pi: 0.72 },
};

const SNAP = {
  off: null,
  dust: { min: 1.0, max: 1.2, odds: 4.2 },
  chop: { min: 1.2, max: 2.0, odds: 2.6 },
  cook: { min: 2.0, max: 5.0, odds: 2.8 },
  moon: { min: 5.0, max: Infinity, odds: 4.4 },
};

const HEAT_FEE = 0.03;
const ASH_RATE = 0.08;
const ROUNDS = 80_000;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function crashPoint(rng, ridge) {
  const cfg = RIDGES[ridge];
  if (rng() < cfg.instantBust) return 1.0;
  const r = rng();
  return Math.max(1.0, Math.floor(((1 - cfg.houseEdge) / (1 - r)) * 100) / 100);
}

function floor2(n) {
  return Math.floor(n * 100) / 100;
}

function snapPay(crash, band, stake) {
  const b = SNAP[band];
  if (!b || stake <= 0) return 0;
  const hit = crash >= b.min && crash < b.max;
  return hit ? floor2(stake * b.odds) : 0;
}

/**
 * strategy:
 * - cashAt: number | null (null = hold forever / always bust)
 * - peelAt: number | null
 * - paper, heat, ridge, margin, snap, snapStake
 * - useAsh: whether to apply ash to margin when available
 */
function playRound(rng, strat, ash) {
  const margin = strat.margin;
  const L = strat.heat;
  const N = margin * L;
  const fee = L > 1 ? floor2(HEAT_FEE * (L - 1) * margin) : 0;
  const prem = floor2(PAPER[strat.paper].pi * N);
  const snapStake = strat.snap === "off" ? 0 : strat.snapStake;
  // Ash discounts fees+prem only — never notional escrow
  const ashApplied = strat.useAsh ? Math.min(ash, floor2(fee + prem)) : 0;
  const cashIn = floor2(N + fee + prem + snapStake - ashApplied);

  const crash = crashPoint(rng, strat.ridge);
  let remaining = N;
  let paidOut = 0;
  let paperActive = strat.paper !== "off";
  let peeled = false;

  if (strat.peelAt != null && crash > strat.peelAt) {
    const half = floor2(remaining / 2);
    paidOut += floor2(half * strat.peelAt);
    remaining = floor2(remaining - half);
    peeled = true;
  }

  let busted = false;
  if (strat.cashAt == null) {
    busted = true;
  } else if (crash > strat.cashAt) {
    paidOut += floor2(remaining * strat.cashAt);
    remaining = 0;
    paperActive = false; // cashed
  } else {
    busted = true;
  }

  let paperPay = 0;
  let ashCredit = 0;
  if (busted && remaining > 0) {
    if (paperActive) {
      paperPay = floor2(PAPER[strat.paper].alpha * remaining);
      paidOut += paperPay;
    }
    const marginLost = floor2(remaining / L);
    ashCredit = floor2(ASH_RATE * marginLost);
  }

  paidOut += snapPay(crash, strat.snap, snapStake);

  // House cash PnL this round. ASH is not cash until spent (expires → house keeps).
  const house = cashIn - paidOut;
  const playerDelta = -cashIn + paidOut;

  return {
    house,
    playerDelta,
    cashIn,
    paidOut,
    paperPay,
    ashCredit,
    ashApplied,
    crash,
    peeled,
    busted,
  };
}

function simulate(name, strat, rounds = ROUNDS) {
  const rng = mulberry32((hash(name) ^ 0xc0ffee) >>> 0);
  let ash = 0;
  let house = 0;
  let player = 0;
  let turnover = 0; // sum of cashIn + ashApplied (economic handle)
  let paperPrem = 0;
  let heatFees = 0;
  let snapIn = 0;
  let wins = 0;

  for (let i = 0; i < rounds; i++) {
    const s = { ...strat, useAsh: true };
    const M = s.margin;
    const L = s.heat;
    const N = M * L;
    heatFees += L > 1 ? floor2(HEAT_FEE * (L - 1) * M) : 0;
    paperPrem += floor2(PAPER[s.paper].pi * N);
    snapIn += s.snap === "off" ? 0 : s.snapStake;

    const r = playRound(rng, s, ash);
    ash = Math.max(0, ash - r.ashApplied) + r.ashCredit;
    // ash expires conceptually each round if unused — model: keep until used (optimistic for player)
    // stricter: expire each round
    if (r.ashApplied === 0 && ash > 0 && r.ashCredit === 0) {
      // expire unused ash from prior (harsh house-favoring)
      // only expire if we had ash and didn't apply — approximate next-fuse rule
    }
    // Next-fuse-only: if ash existed at start and not applied fully, remainder expires after round with no credit use
    // Simplified: ash only lasts one round
    const ashNext = r.ashCredit;
    ash = ashNext;

    house += r.house;
    player += r.playerDelta;
    turnover += r.cashIn + r.ashApplied;
    if (r.playerDelta > 0) wins++;
  }

  const edgeOnTurnover = turnover > 0 ? house / turnover : 0;
  const playerEvPerRound = player / rounds;
  const housePerRound = house / rounds;

  return {
    name,
    rounds,
    houseTotal: round(house),
    playerTotal: round(player),
    housePerRound: round(housePerRound),
    playerEvPerRound: round(playerEvPerRound),
    edgePct: round(edgeOnTurnover * 100),
    winRatePct: round((wins / rounds) * 100),
    turnover: round(turnover),
    paperPrem: round(paperPrem),
    heatFees: round(heatFees),
    snapIn: round(snapIn),
  };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

const strategies = [
  {
    name: "Vanilla hold@2 SEND",
    ridge: "rise",
    margin: 10,
    heat: 1,
    paper: "off",
    snap: "off",
    snapStake: 0,
    cashAt: 2,
    peelAt: null,
  },
  {
    name: "Vanilla hold@5 DEGEN",
    ridge: "spike",
    margin: 10,
    heat: 1,
    paper: "off",
    snap: "off",
    snapStake: 0,
    cashAt: 5,
    peelAt: null,
  },
  {
    name: "HALF CHAD hold@2",
    ridge: "rise",
    margin: 10,
    heat: 1,
    paper: "half",
    snap: "off",
    snapStake: 0,
    cashAt: 2,
    peelAt: null,
  },
  {
    name: "FULL void-vig cash@1.4",
    ridge: "calm",
    margin: 10,
    heat: 1,
    paper: "full",
    snap: "off",
    snapStake: 0,
    cashAt: 1.4,
    peelAt: null,
  },
  {
    name: "HEAT2 hold@2",
    ridge: "rise",
    margin: 10,
    heat: 2,
    paper: "off",
    snap: "off",
    snapStake: 0,
    cashAt: 2,
    peelAt: null,
  },
  {
    name: "HEAT2 + HALF hold@2",
    ridge: "rise",
    margin: 10,
    heat: 2,
    paper: "half",
    snap: "off",
    snapStake: 0,
    cashAt: 2,
    peelAt: null,
  },
  {
    name: "HEAT2 + FULL hold@3",
    ridge: "spike",
    margin: 10,
    heat: 2,
    paper: "full",
    snap: "off",
    snapStake: 0,
    cashAt: 3,
    peelAt: null,
  },
  {
    name: "Peel@1.5 then hold@3",
    ridge: "rise",
    margin: 10,
    heat: 1,
    paper: "half",
    snap: "off",
    snapStake: 0,
    cashAt: 3,
    peelAt: 1.5,
  },
  {
    name: "COLD TAPE moon snap + HALF HEAT2",
    ridge: "rise",
    margin: 10,
    heat: 2,
    paper: "half",
    snap: "moon",
    snapStake: 2,
    cashAt: 2,
    peelAt: null,
  },
  {
    name: "SNAP only chop (ride cash@1.01)",
    ridge: "rise",
    margin: 10,
    heat: 1,
    paper: "off",
    snap: "chop",
    snapStake: 5,
    cashAt: 1.01,
    peelAt: null,
  },
  {
    name: "ASH LOOP always bust HEAT2",
    ridge: "spike",
    margin: 10,
    heat: 2,
    paper: "off",
    snap: "off",
    snapStake: 0,
    cashAt: null,
    peelAt: null,
  },
  {
    name: "Diamond hands forever + FULL",
    ridge: "rise",
    margin: 10,
    heat: 1,
    paper: "full",
    snap: "off",
    snapStake: 0,
    cashAt: null,
    peelAt: null,
  },
];

const results = strategies.map((s) =>
  simulate(s.name, s, ROUNDS),
);

// Mixed book: weighted blend of strategies each round
function simulateMix(rounds = ROUNDS) {
  const weights = [
    [0.25, strategies[0]],
    [0.1, strategies[1]],
    [0.15, strategies[2]],
    [0.08, strategies[3]],
    [0.1, strategies[4]],
    [0.12, strategies[5]],
    [0.05, strategies[6]],
    [0.05, strategies[7]],
    [0.05, strategies[8]],
    [0.05, strategies[10]],
  ];
  const rng = mulberry32(0xabcdd00d);
  let house = 0;
  let turnover = 0;
  let ash = 0;
  for (let i = 0; i < rounds; i++) {
    let u = rng();
    let pick = weights[0][1];
    for (const [w, s] of weights) {
      if (u < w) {
        pick = s;
        break;
      }
      u -= w;
    }
    const r = playRound(rng, { ...pick, useAsh: true }, ash);
    ash = r.ashCredit;
    house += r.house;
    turnover += r.cashIn + r.ashApplied;
  }
  return {
    name: "MIXED BOOK (degen portfolio)",
    rounds,
    houseTotal: round(house),
    housePerRound: round(house / rounds),
    edgePct: round((house / turnover) * 100),
    turnover: round(turnover),
  };
}

const mix = simulateMix();

const out = {
  meta: {
    roundsPerStrategy: ROUNDS,
    note: "Ash modeled as next-fuse-only (expires if unused). House = cashIn - payouts - ashCredit.",
    generatedAt: new Date().toISOString(),
  },
  strategies: results,
  mixedBook: mix,
  rankingByHouseEdge: [...results]
    .sort((a, b) => b.edgePct - a.edgePct)
    .map((r) => ({ name: r.name, edgePct: r.edgePct, housePerRound: r.housePerRound })),
  anyPlayerPositiveEv: results.filter((r) => r.playerEvPerRound > 0).map((r) => r.name),
};

console.log(JSON.stringify(out, null, 2));
