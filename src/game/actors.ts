import type { HeatLev, PaperTier } from "./products";
import type { RidgeId } from "./ridges";

export type ActorStatus = "waiting" | "riding" | "peeled" | "cashed" | "bust";

export type Actor = {
  id: string;
  name: string;
  you: boolean;
  bot: boolean;
  ridge: RidgeId;
  color: string;
  /** Posted margin (cash/ash) */
  bet: number;
  /** Notional still riding (= margin * leverage at open, then peels down) */
  remaining: number;
  locked: number;
  status: ActorStatus;
  exitAt: number | null;
  targetExit: number;
  willPeel: boolean;
  peelAt: number;
  leverage: HeatLev;
  paperTier: PaperTier;
  /** False after CASH — premium sunk, no claim */
  paperActive: boolean;
  ashApplied: number;
};

const BOT_HANDLES = [
  "rio.br",
  "nova_x",
  "mule.gg",
  "zara.cash",
  "kip",
  "haze.eth",
  "oro77",
  "jinx_",
  "tess.ok",
  "vox",
  "nori.jp",
  "bolt.tv",
  "kami",
  "drift_9",
  "hex.sol",
  "luna.gg",
  "papi.lat",
  "degen.max",
  "yuki.os",
  "reef",
  "sable",
  "chop",
  "mika.fi",
  "ace.ng",
];

const COLORS = [
  "#ff8a4c",
  "#5ddea0",
  "#e07a3d",
  "#7ec8ff",
  "#ffb4a2",
  "#f0e68c",
  "#d4a5ff",
  "#9ae6b4",
  "#ff6b9d",
  "#ffd166",
];

function stakeFromRng(rng: () => number): number {
  const roll = rng();
  if (roll < 0.45) return 2 + Math.floor(rng() * 8);
  if (roll < 0.8) return 10 + Math.floor(rng() * 30);
  if (roll < 0.95) return 40 + Math.floor(rng() * 80);
  return 120 + Math.floor(rng() * 280);
}

export function makeBots(count: number, rng: () => number): Actor[] {
  const used = new Set<string>();
  const bots: Actor[] = [];
  const n = Math.min(count, BOT_HANDLES.length);
  const order = BOT_HANDLES.map((_, i) => i).sort(() => rng() - 0.5);

  for (let i = 0; i < n; i++) {
    let name = BOT_HANDLES[order[i] % BOT_HANDLES.length];
    if (used.has(name)) name = `${name}${Math.floor(rng() * 90 + 10)}`;
    used.add(name);
    const ridges: RidgeId[] = ["calm", "rise", "spike"];
    const ridge = ridges[Math.floor(rng() * 3)];
    const targetExit =
      1.12 + rng() * (ridge === "spike" ? 7.5 : ridge === "rise" ? 4.2 : 2.4);
    const bet = stakeFromRng(rng);
    bots.push({
      id: `bot-${name}-${i}`,
      name,
      you: false,
      bot: true,
      ridge,
      color: COLORS[i % COLORS.length],
      bet,
      remaining: 0,
      locked: 0,
      status: "waiting",
      exitAt: null,
      targetExit: Math.floor(targetExit * 100) / 100,
      willPeel: rng() < 0.48,
      peelAt: 1.2 + rng() * 2.4,
      leverage: 1,
      paperTier: "off",
      paperActive: false,
      ashApplied: 0,
    });
  }
  return bots;
}

export type YouBetOpts = {
  name: string;
  ridge: RidgeId;
  margin: number;
  notional: number;
  leverage: HeatLev;
  paperTier: PaperTier;
  ashApplied: number;
};

export function makeYou(opts: YouBetOpts): Actor {
  return {
    id: "you",
    name: opts.name,
    you: true,
    bot: false,
    ridge: opts.ridge,
    color: "#ff5a1f",
    bet: opts.margin,
    remaining: opts.notional,
    locked: 0,
    status: "waiting",
    exitAt: null,
    targetExit: 999,
    willPeel: false,
    peelAt: 0,
    leverage: opts.leverage,
    paperTier: opts.paperTier,
    paperActive: opts.paperTier !== "off",
    ashApplied: opts.ashApplied,
  };
}
