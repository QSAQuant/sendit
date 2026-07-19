import "./style.css";
import { Sfx } from "./game/audio";
import {
  createDopamine,
  decayHeat,
  onLoss,
  onWin,
  toast,
  type DopamineState,
} from "./game/dopamine";
import { LiveNet } from "./game/net";
import { SurgeRenderer } from "./game/render";
import type { RidgeId } from "./game/ridges";
import { RIDGES } from "./game/ridges";
import {
  cashYou,
  clearYou,
  createRoom,
  peelYou,
  placeBet,
  tickRoom,
  youRiding,
  type Room,
} from "./game/room";

const balanceEl = el("#balance");
const onlineEl = el("#online");
const multEl = el("#mult");
const statusEl = el("#status");
const hintEl = el("#hint");
const toastEl = el("#toast");
const levelEl = el("#level");
const streakEl = el("#streak");
const xpFill = el("#xp-fill");
const heatFill = el("#heat-fill");
const kingEl = el("#king");
const roundEl = el("#round");
const crashAtEl = el("#crash-at");
const historyEl = el("#history");
const feedEl = el("#feed");
const fairLabel = el("#fair-label");
const fairValue = el("#fair-value");
const coachEl = el("#coach");
const betInput = el<HTMLInputElement>("#bet");
const autoInput = el<HTMLInputElement>("#auto");
const primaryBtn = el<HTMLButtonElement>("#primary");
const peelBtn = el<HTMLButtonElement>("#peel");
const cashoutBtn = el<HTMLButtonElement>("#cashout");
const muteBtn = el<HTMLButtonElement>("#mute");
const canvas = el<HTMLCanvasElement>("#canvas");
const app = el("#app");

const PLAYER = "you";
const sfx = new Sfx();
const net = new LiveNet(PLAYER);
const renderer = new SurgeRenderer(canvas);

let balance = 1000;
let ridge: RidgeId = "rise";
let room: Room = createRoom();
let dopa: DopamineState = createDopamine();
let lockedIn = false;
let lastTickBeep = 0;
let lastMilestone = 1;
let lastHeld: number | null = null;
const feed: { text: string; kind: string }[] = [];

function el<T extends HTMLElement = HTMLElement>(sel: string): T {
  const n = document.querySelector(sel);
  if (!n) throw new Error(`Missing ${sel}`);
  return n as T;
}

function money(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function readBet() {
  const v = Number(betInput.value);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
}

function pushFeed(text: string, kind: string) {
  feed.unshift({ text, kind });
  if (feed.length > 6) feed.pop();
  feedEl.innerHTML = feed
    .map((f) => `<div class="feed-item ${f.kind}">${f.text}</div>`)
    .join("");
}

function paintRidges() {
  document.querySelectorAll<HTMLButtonElement>(".ridge").forEach((b) => {
    b.classList.toggle("active", b.dataset.ridge === ridge);
  });
}

function paintDopa(now: number) {
  levelEl.textContent = `LVL ${dopa.level}`;
  streakEl.textContent = `${dopa.streak} STREAK`;
  xpFill.style.width = `${(dopa.xp / dopa.xpToNext) * 100}%`;
  heatFill.style.width = `${dopa.heat}%`;
  kingEl.textContent =
    dopa.kingMult > 0
      ? `${dopa.kingName} ${dopa.kingMult.toFixed(2)}×`
      : "—";
  app.classList.toggle("hot", dopa.heat > 55 || dopa.streak >= 3);

  if (dopa.lastToast && now < dopa.toastUntil) {
    toastEl.hidden = false;
    toastEl.textContent = dopa.lastToast;
  } else {
    toastEl.hidden = true;
  }
}

function paintHud(now: number) {
  balanceEl.textContent = money(balance);
  onlineEl.textContent = String(room.online + net.peerCount());
  roundEl.textContent = String(room.round);
  multEl.textContent = `${room.multiplier.toFixed(2)}×`;
  multEl.classList.toggle("hot", room.phase === "flying" && room.multiplier >= 2);
  multEl.classList.toggle("dead", room.phase === "crashed");
  paintRidges();
  paintDopa(now);

  historyEl.textContent = room.history.length
    ? room.history.map((x) => `${x.toFixed(2)}×`).join(" · ")
    : "—";

  if (room.seedRevealed) {
    fairLabel.textContent = "Seed";
    fairValue.textContent = room.seed.toString(16).padStart(8, "0");
    fairValue.title = `Hash was ${room.seedHash}`;
  } else {
    fairLabel.textContent = "Hash";
    fairValue.textContent = room.seedHash;
    fairValue.title = "Seed reveals on snap";
  }

  const riding = !!youRiding(room);

  if (room.phase === "countdown") {
    const sec = Math.ceil(Math.max(0, room.countdownEnds - now) / 1000);
    statusEl.textContent = lockedIn ? "SENT · WAITING" : "NEXT FUSE";
    hintEl.textContent = lockedIn
      ? `${RIDGES[ridge].label} lane · ${sec}s`
      : `Don't paper. Fuse in ${sec}s.`;
    primaryBtn.textContent = lockedIn ? "SENT" : "SEND";
    primaryBtn.classList.toggle("armed", lockedIn);
    primaryBtn.disabled = lockedIn;
    peelBtn.disabled = true;
    cashoutBtn.disabled = true;
    crashAtEl.textContent = "—";
    setInputs(false);
  } else if (room.phase === "flying") {
    statusEl.textContent = riding ? "HOLDING" : "WATCHING";
    hintEl.textContent = riding
      ? "Peel half. Or send it. Pack is watching."
      : "Watch the pack · send next fuse";
    primaryBtn.textContent = "LIVE";
    primaryBtn.disabled = true;
    peelBtn.disabled = !riding;
    cashoutBtn.disabled = !riding;
    peelBtn.classList.toggle("peel-live", riding);
    cashoutBtn.classList.toggle("live", riding);
    crashAtEl.textContent = "live";
    setInputs(true);
  } else {
    statusEl.textContent = "SNAPPED";
    hintEl.textContent = `Snap @ ${room.crashAt.toFixed(2)}× · run it back`;
    primaryBtn.textContent = "…";
    primaryBtn.disabled = true;
    peelBtn.disabled = true;
    cashoutBtn.disabled = true;
    crashAtEl.textContent = `${room.crashAt.toFixed(2)}×`;
    setInputs(true);
  }
}

function setInputs(disabled: boolean) {
  betInput.disabled = disabled && lockedIn;
  document.querySelectorAll<HTMLButtonElement>(".ridge, [data-bet-adj], [data-bet-set]").forEach((b) => {
    b.disabled = room.phase !== "countdown" || lockedIn;
  });
}

function tryLock() {
  if (room.phase !== "countdown" || lockedIn) return;
  const bet = readBet();
  if (bet > balance) {
    dopa = { ...dopa };
    toast(dopa, "NEED MORE BANK", performance.now());
    return;
  }
  const next = placeBet(room, ridge, bet, PLAYER);
  if (!next) return;
  balance -= bet;
  room = next;
  lockedIn = true;
  lastHeld = null;
  sfx.bet();
  renderer.pulse("bet");
  net.send({ type: "bet", id: net.selfId, name: PLAYER, ridge, bet });
  pushFeed(`you sent ${bet} on ${RIDGES[ridge].label}`, "peel");
}

function doPeel() {
  const res = peelYou(room);
  if (!res) return;
  room = res.room;
  balance += res.locked;
  lastHeld = res.at;
  sfx.peel();
  renderer.pulse("peel");
  toast(dopa, `PEELED @ ${res.at.toFixed(2)}×`, performance.now(), 900);
  pushFeed(`you peeled @ ${res.at.toFixed(2)}×`, "peel");
  net.send({ type: "peel", id: net.selfId, at: res.at });
}

function doCash() {
  const res = cashYou(room);
  if (!res) return;
  room = res.room;
  balance += res.payout;
  lastHeld = res.at;
  const big = res.at >= 5;
  sfx.cash(big);
  renderer.pulse("cash");
  dopa = onWin(dopa, res.at, PLAYER, performance.now());
  if (dopa.streak === 3 || dopa.streak === 5) sfx.streak();
  pushFeed(`you out @ ${res.at.toFixed(2)}× (+${money(res.payout)})`, "cash");
  net.send({ type: "cash", id: net.selfId, at: res.at });
  lockedIn = false;
}

function onRoundCrash(at: number, now: number) {
  sfx.crash();
  renderer.pulse("crash");
  const riding = youRiding(room);
  // If still riding at crash, you lost remaining (locked already banked)
  if (riding) {
    dopa = onLoss(dopa, at, lastHeld, now);
    if (dopa.nearMiss) sfx.nearMiss();
    pushFeed(`you snapped @ ${at.toFixed(2)}×`, "bust");
  }
  lockedIn = false;
  room = clearYou(room);
}

function maybeAutobuy() {
  if (!autoInput.checked) return;
  if (room.phase !== "countdown" || lockedIn) return;
  tryLock();
}

function announcePackJoins() {
  const waiting = room.actors.filter((a) => a.bot).slice(0, 4);
  for (const a of waiting) {
    const lane =
      a.ridge === "calm" ? "SLOW" : a.ridge === "spike" ? "DEGEN" : "SEND";
    pushFeed(`${a.name} queued ${a.bet} · ${lane}`, "peel");
  }
}

net.onMessage = (m) => {
    if (m.type === "bet") pushFeed(`${m.name} sent on ${m.ridge}`, "peel");
  if (m.type === "cash") pushFeed(`${m.id.slice(0, 4)} out @ ${m.at.toFixed(2)}×`, "cash");
  if (m.type === "peel") pushFeed(`${m.id.slice(0, 4)} peeled @ ${m.at.toFixed(2)}×`, "peel");
};

let prevPhase = room.phase;

function frame(now: number) {
  const { room: next, events } = tickRoom(room, now);
  room = next;

  for (const ev of events) {
    if (ev.type === "countdown" && Math.floor(ev.t / 1000) !== Math.floor((ev.t + 16) / 1000)) {
      if (ev.t < 3000) sfx.countdown();
    }
    if (ev.type === "fly") {
      renderer.resetTrail();
      lastMilestone = 1;
      sfx.ignite();
      toast(dopa, "FUSE LIT — DON'T PAPER", now, 900);
      const ridingN = room.actors.filter((a) => a.status === "riding").length;
      pushFeed(`${ridingN} on the fuse · FIRE`, "cash");
      coachEl.classList.add("dim");
    }
    if (ev.type === "tick") {
      if (ev.mult - lastTickBeep >= 0.28) {
        sfx.tick(ev.mult);
        lastTickBeep = ev.mult;
      }
      const mFloor = Math.floor(ev.mult);
      if (mFloor > lastMilestone && mFloor >= 2) {
        lastMilestone = mFloor;
        sfx.milestone(mFloor);
        toast(dopa, `${mFloor}× HEAT`, now, 700);
        renderer.pulse("bet");
      }
    }
    if (ev.type === "actor_peel") {
      pushFeed(`${ev.actor.name} peeled @ ${ev.at.toFixed(2)}×`, "peel");
    }
    if (ev.type === "actor_cash") {
      pushFeed(`${ev.actor.name} out @ ${ev.at.toFixed(2)}×`, "cash");
      if (ev.at > dopa.kingMult) {
        dopa = {
          ...dopa,
          kingMult: ev.at,
          kingName: ev.actor.name,
        };
        toast(dopa, `KING ${ev.actor.name} ${ev.at.toFixed(2)}×`, now);
      }
    }
    if (ev.type === "actor_bust" && !ev.actor.you) {
      // sparse bust spam
    }
    if (ev.type === "crash") {
      onRoundCrash(ev.at, now);
    }
    if (ev.type === "round_reset") {
      lastTickBeep = 0;
      lastMilestone = 1;
      lastHeld = null;
      announcePackJoins();
      maybeAutobuy();
    }
  }

  if (prevPhase !== "countdown" && room.phase === "countdown") {
    maybeAutobuy();
  }
  prevPhase = room.phase;

  dopa = decayHeat(dopa, 1 / 60);

  paintHud(now);
  renderer.draw({
    phase: room.phase,
    multiplier: room.multiplier,
    ridge,
    crashAt: room.crashAt,
    actors: room.actors,
    heat: dopa.heat,
    countdown: Math.max(0, room.countdownEnds - now),
  });

  requestAnimationFrame(frame);
}

primaryBtn.addEventListener("click", tryLock);
peelBtn.addEventListener("click", doPeel);
cashoutBtn.addEventListener("click", doCash);
muteBtn.addEventListener("click", () => {
  muteBtn.textContent = sfx.toggleMute() ? "SFX OFF" : "SFX ON";
});

document.querySelectorAll<HTMLButtonElement>(".ridge").forEach((btn) => {
  btn.addEventListener("click", () => {
    ridge = (btn.dataset.ridge as RidgeId) ?? "rise";
    paintRidges();
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-bet-adj]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const adj = Number(btn.dataset.betAdj);
    betInput.value = String(Math.max(1, readBet() + adj * (readBet() >= 25 ? 5 : 1)));
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-bet-set]").forEach((btn) => {
  btn.addEventListener("click", () => {
    betInput.value = btn.dataset.betSet ?? "10";
  });
});

window.addEventListener("resize", () => renderer.resize(canvas));
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (youRiding(room)) doCash();
    else tryLock();
  }
  if (e.code === "KeyP") doPeel();
  if (e.code === "Digit1") ridge = "calm";
  if (e.code === "Digit2") ridge = "rise";
  if (e.code === "Digit3") ridge = "spike";
  paintRidges();
});

// unlock audio on first gesture
window.addEventListener(
  "pointerdown",
  () => {
    sfx.bet();
  },
  { once: true },
);

announcePackJoins();
paintHud(performance.now());
requestAnimationFrame(frame);
