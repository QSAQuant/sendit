export type DopamineState = {
  streak: number;
  bestStreak: number;
  heat: number; // 0–100
  xp: number;
  level: number;
  xpToNext: number;
  kingName: string;
  kingMult: number;
  nearMiss: boolean;
  lastToast: string;
  toastUntil: number;
};

export function createDopamine(): DopamineState {
  return {
    streak: 0,
    bestStreak: 0,
    heat: 0,
    xp: 0,
    level: 1,
    xpToNext: 100,
    kingName: "—",
    kingMult: 0,
    nearMiss: false,
    lastToast: "",
    toastUntil: 0,
  };
}

function xpNeeded(level: number) {
  return Math.floor(100 * Math.pow(1.25, level - 1));
}

export function toast(d: DopamineState, msg: string, now: number, ms = 1600) {
  d.lastToast = msg;
  d.toastUntil = now + ms;
}

export function onWin(
  d: DopamineState,
  mult: number,
  name: string,
  now: number,
): DopamineState {
  const next = { ...d };
  next.streak += 1;
  next.bestStreak = Math.max(next.bestStreak, next.streak);
  next.heat = Math.min(100, next.heat + 12 + Math.min(mult, 8) * 2);
  next.xp += Math.floor(18 + mult * 6 + next.streak * 4);
  while (next.xp >= next.xpToNext) {
    next.xp -= next.xpToNext;
    next.level += 1;
    next.xpToNext = xpNeeded(next.level);
    toast(next, `LEVEL ${next.level}`, now, 2000);
  }
  if (mult > next.kingMult) {
    next.kingMult = mult;
    next.kingName = name;
    toast(next, `NEW KING · ${mult.toFixed(2)}×`, now, 1800);
  }
  if (next.streak === 3) toast(next, "ON FIRE · 3 STREAK", now);
  if (next.streak === 5) toast(next, "UNSTOPPABLE · 5", now);
  if (next.streak >= 7) toast(next, `${next.streak} STREAK`, now);
  if (mult >= 5) toast(next, `BIG HIT ${mult.toFixed(2)}×`, now);
  return next;
}

export function onLoss(
  d: DopamineState,
  crashAt: number,
  heldUntil: number | null,
  now: number,
): DopamineState {
  const next = { ...d };
  next.streak = 0;
  next.heat = Math.max(0, next.heat - 22);
  next.xp += 4; // consolation drip — keep bar moving
  next.nearMiss = false;
  if (heldUntil != null && crashAt - heldUntil > 0 && crashAt - heldUntil < 0.35) {
    next.nearMiss = true;
    toast(next, `SO CLOSE · snapped ${crashAt.toFixed(2)}×`, now, 2000);
  } else if (crashAt < 1.2) {
    toast(next, "INSTANT SNAP", now, 1200);
  } else {
    toast(next, "PAPERED — send again", now, 1200);
  }
  return next;
}

export function decayHeat(d: DopamineState, dt: number): DopamineState {
  if (d.heat <= 0) return d;
  return { ...d, heat: Math.max(0, d.heat - dt * 3) };
}
