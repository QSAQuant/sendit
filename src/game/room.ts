import { makeBots, makeYou, type Actor } from "./actors";
import {
  generateCrashPoint,
  hashSeed,
  mulberry32,
  seedFromTime,
} from "./rng";
import { RIDGES, type RidgeId } from "./ridges";

export type RoomPhase = "countdown" | "flying" | "crashed";

export type RoomEvent =
  | { type: "countdown"; t: number }
  | { type: "fly" }
  | { type: "tick"; mult: number }
  | { type: "actor_peel"; actor: Actor; at: number; locked: number }
  | { type: "actor_cash"; actor: Actor; at: number; payout: number }
  | { type: "actor_bust"; actor: Actor }
  | { type: "crash"; at: number }
  | { type: "round_reset" };

export type Room = {
  phase: RoomPhase;
  seed: number;
  seedHash: string;
  seedRevealed: boolean;
  crashAt: number;
  multiplier: number;
  ridgeFocus: RidgeId;
  actors: Actor[];
  history: number[];
  countdownEnds: number;
  flyStarted: number;
  crashUntil: number;
  online: number;
  round: number;
};

const COUNTDOWN_MS = 5200;
const CRASH_HOLD_MS = 1400;

function hashNoise(id: string, mult: number): number {
  let h = Math.floor(mult * 100);
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function commitRound(round: number, botCount = 12): Pick<
  Room,
  "seed" | "seedHash" | "seedRevealed" | "actors" | "online"
> {
  const seed = seedFromTime();
  const rng = mulberry32(seed);
  return {
    seed,
    seedHash: hashSeed(seed, round),
    seedRevealed: false,
    actors: makeBots(botCount, rng),
    online: 48 + Math.floor(rng() * 96),
  };
}

export function createRoom(): Room {
  const round = 1;
  const committed = commitRound(round);
  return {
    phase: "countdown",
    ...committed,
    crashAt: 0,
    multiplier: 1,
    ridgeFocus: "rise",
    history: [],
    countdownEnds: performance.now() + COUNTDOWN_MS,
    flyStarted: 0,
    crashUntil: 0,
    round,
  };
}

function growth(room: Room): number {
  // Room uses blended growth; player ridge affects their own feel via UI
  return RIDGES[room.ridgeFocus].growth;
}

export function placeBet(
  room: Room,
  ridge: RidgeId,
  bet: number,
  playerName: string,
): Room | null {
  if (room.phase !== "countdown") return null;
  const others = room.actors.filter((a) => !a.you);
  const you = makeYou(playerName, ridge, bet);
  return { ...room, actors: [...others, you], ridgeFocus: ridge };
}

export function clearYou(room: Room): Room {
  return { ...room, actors: room.actors.filter((a) => !a.you) };
}

function armBots(room: Room, rng: () => number): Actor[] {
  return room.actors.map((a) => {
    if (!a.bot) {
      if (a.status === "waiting" && a.bet > 0) {
        return {
          ...a,
          status: "riding" as const,
          remaining: a.bet,
          locked: 0,
          exitAt: null,
        };
      }
      return a;
    }
    const ridges: RidgeId[] = ["calm", "rise", "spike"];
    const ridge = ridges[Math.floor(rng() * 3)];
    const bet = 5 + Math.floor(rng() * 45);
    const targetExit =
      Math.floor((1.15 + rng() * (ridge === "spike" ? 9 : 4.5)) * 100) / 100;
    return {
      ...a,
      ridge,
      bet,
      remaining: bet,
      locked: 0,
      status: "riding" as const,
      exitAt: null,
      targetExit,
      willPeel: rng() < 0.4,
      peelAt: 1.25 + rng() * 2.2,
      color: a.color,
    };
  });
}

function startFly(room: Room, now: number): { room: Room; events: RoomEvent[] } {
  // Crash stream is isolated from bot-arming so the public seed verifies cleanly
  const crashRng = mulberry32(room.seed);
  const botRng = mulberry32(room.seed ^ 0xa5a5a5a5);
  const cfg = RIDGES[room.ridgeFocus];
  const crashAt = generateCrashPoint(crashRng, cfg);
  const actors = armBots(room, botRng);
  return {
    room: {
      ...room,
      phase: "flying",
      crashAt,
      multiplier: 1,
      actors,
      flyStarted: now,
      online: Math.max(30, room.online + Math.floor(botRng() * 12) - 4),
    },
    events: [{ type: "fly" }],
  };
}

function settleCrash(room: Room, now: number): { room: Room; events: RoomEvent[] } {
  const events: RoomEvent[] = [{ type: "crash", at: room.crashAt }];
  const actors = room.actors.map((a) => {
    if (a.status === "riding") {
      events.push({ type: "actor_bust", actor: a });
      return { ...a, status: "bust" as const, remaining: 0, exitAt: room.crashAt };
    }
    return a;
  });
  return {
    room: {
      ...room,
      phase: "crashed",
      multiplier: room.crashAt,
      actors,
      seedRevealed: true,
      history: [room.crashAt, ...room.history].slice(0, 16),
      crashUntil: now + CRASH_HOLD_MS,
    },
    events,
  };
}

function nextCountdown(room: Room, now: number): { room: Room; events: RoomEvent[] } {
  const youPrev = room.actors.find((a) => a.you);
  const you = youPrev
    ? {
        ...youPrev,
        status: "waiting" as const,
        remaining: 0,
        locked: 0,
        exitAt: null,
        bet: 0,
      }
    : undefined;
  const nextRound = room.round + 1;
  const committed = commitRound(nextRound, 12 + Math.floor(Math.random() * 4));
  return {
    room: {
      ...room,
      phase: "countdown",
      ...committed,
      actors: you ? [...committed.actors, you] : committed.actors,
      crashAt: 0,
      multiplier: 1,
      countdownEnds: now + COUNTDOWN_MS,
      round: nextRound,
    },
    events: [{ type: "round_reset" }],
  };
}

export function tickRoom(
  room: Room,
  now: number,
): { room: Room; events: RoomEvent[] } {
  const events: RoomEvent[] = [];

  if (room.phase === "countdown") {
    const left = Math.max(0, room.countdownEnds - now);
    events.push({ type: "countdown", t: left });
    if (now >= room.countdownEnds) {
      return startFly(room, now);
    }
    return { room, events };
  }

  if (room.phase === "crashed") {
    if (now >= room.crashUntil) return nextCountdown(room, now);
    return { room, events };
  }

  // flying
  const elapsed = now - room.flyStarted;
  let mult = Math.exp(elapsed * growth(room));
  mult = Math.floor(mult * 100) / 100;

  let actors = room.actors.map((a) => ({ ...a }));
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (a.status !== "riding" || a.you) continue;

    if (a.willPeel && mult >= a.peelAt && a.locked === 0 && a.remaining > 0) {
      const half = Math.floor((a.remaining / 2) * 100) / 100;
      const locked = Math.floor(half * mult * 100) / 100;
      actors[i] = {
        ...a,
        remaining: Math.floor((a.remaining - half) * 100) / 100,
        locked,
        targetExit: mult + 0.3 + (hashNoise(a.id, mult) % 120) / 100,
        willPeel: false,
      };
      events.push({
        type: "actor_peel",
        actor: actors[i],
        at: mult,
        locked,
      });
    }

    if (mult >= a.targetExit && a.remaining > 0) {
      const payout =
        Math.floor((a.remaining * mult + a.locked) * 100) / 100;
      actors[i] = {
        ...a,
        ...actors[i],
        status: "cashed",
        remaining: 0,
        exitAt: mult,
      };
      events.push({
        type: "actor_cash",
        actor: actors[i],
        at: mult,
        payout,
      });
    }
  }

  if (mult >= room.crashAt) {
    return settleCrash(
      { ...room, multiplier: room.crashAt, actors },
      now,
    );
  }

  events.push({ type: "tick", mult });
  return { room: { ...room, multiplier: mult, actors }, events };
}

export function peelYou(
  room: Room,
): { room: Room; locked: number; at: number } | null {
  if (room.phase !== "flying") return null;
  const idx = room.actors.findIndex((a) => a.you && a.status === "riding");
  if (idx < 0) return null;
  const a = room.actors[idx];
  if (a.remaining <= 0) return null;
  const half = Math.floor((a.remaining / 2) * 100) / 100;
  if (half <= 0) return null;
  const locked = Math.floor(half * room.multiplier * 100) / 100;
  const actors = room.actors.slice();
  actors[idx] = {
    ...a,
    remaining: Math.floor((a.remaining - half) * 100) / 100,
    locked: a.locked + locked,
  };
  return {
    room: { ...room, actors },
    locked,
    at: room.multiplier,
  };
}

export function cashYou(
  room: Room,
): { room: Room; payout: number; at: number } | null {
  if (room.phase !== "flying") return null;
  const idx = room.actors.findIndex(
    (a) => a.you && (a.status === "riding" || a.status === "peeled"),
  );
  if (idx < 0) return null;
  const a = room.actors[idx];
  if (a.status === "cashed" || a.status === "bust") return null;
  // Locked stake was credited at peel time — only pay remaining ride here.
  const payout = Math.floor(a.remaining * room.multiplier * 100) / 100;
  const actors = room.actors.slice();
  actors[idx] = {
    ...a,
    status: "cashed",
    remaining: 0,
    locked: 0,
    exitAt: room.multiplier,
  };
  return { room: { ...room, actors }, payout, at: room.multiplier };
}

export function youRiding(room: Room): Actor | undefined {
  return room.actors.find(
    (a) => a.you && (a.status === "riding" || a.status === "peeled"),
  );
}

export function youActor(room: Room): Actor | undefined {
  return room.actors.find((a) => a.you);
}
