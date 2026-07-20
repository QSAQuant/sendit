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
import {
  MYTHS,
  SNAP_BANDS,
  decodeLoadout,
  encodeLoadout,
  fairPaperPi,
  heatmap,
  loadoutTag,
  runEvLab,
  snapPays,
  verifyRound,
  type RoundRecord,
  type SnapBand,
} from "./game/illusion";
import { LiveNet } from "./game/net";
import {
  ASH_RATE,
  HEAT_FEE_RATE,
  PAPER_TIERS,
  quoteSend,
  settleBust,
  type HeatLev,
  type PaperTier,
} from "./game/products";
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
const heatBtn = el<HTMLButtonElement>("#heat-btn");
const ashBalEl = el("#ash-bal");
const quoteEl = el("#quote");
const loadoutCodeEl = el("#loadout-code");
const snapStakeInput = el<HTMLInputElement>("#snap-stake");
const snapStakeRow = el("#snap-stake-row");
const payBody = el("#pay-body");
const mythsBody = el("#myths-body");
const tapeBody = el("#tape-body");
const verifyBody = el("#verify-body");
const labOut = el("#lab-out");
const labT = el<HTMLInputElement>("#lab-t");
const labCode = el<HTMLInputElement>("#lab-code");
const canvas = el<HTMLCanvasElement>("#canvas");
const app = el("#app");

const PLAYER = "you";
const sfx = new Sfx();
const net = new LiveNet(PLAYER);
const renderer = new SurgeRenderer(canvas);

let balance = 1000;
let ashBalance = 0;
let ashExpiresRound = 0;
let ridge: RidgeId = "rise";
let paperTier: PaperTier = "off";
let heatLev: HeatLev = 1;
let snapBand: SnapBand = "off";
let room: Room = createRoom();
let dopa: DopamineState = createDopamine();
let lockedIn = false;
let pendingSend = false;
let pendingSnapStake = 0;
let lastTickBeep = 0;
let lastMilestone = 1;
let lastHeld: number | null = null;
const feed: { text: string; kind: string }[] = [];
const roundLog: RoundRecord[] = [];
let activePanel = "play";

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

function readMargin() {
  const v = Number(betInput.value);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
}

function readSnapStake() {
  if (snapBand === "off") return 0;
  const v = Number(snapStakeInput.value);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
}

function currentQuote() {
  expireAshIfNeeded();
  const q = quoteSend({
    margin: readMargin(),
    lev: heatLev,
    paperTier,
    ashAvailable: ashBalance,
  });
  const snapStake = readSnapStake();
  return {
    ...q,
    snapStake,
    cashRequired: Math.floor((q.cashRequired + snapStake) * 100) / 100,
  };
}

function currentLoadoutCode() {
  return encodeLoadout({
    ridge,
    heat: heatLev,
    paper: paperTier,
    margin: readMargin(),
    snap: snapBand,
    snapStake: readSnapStake(),
  });
}

function expireAshIfNeeded() {
  if (ashBalance > 0 && room.round > ashExpiresRound) {
    pushFeed(`ash expired ${money(ashBalance)}`, "bust");
    ashBalance = 0;
  }
}

function pushFeed(text: string, kind: string) {
  feed.unshift({ text, kind });
  if (feed.length > 8) feed.pop();
  feedEl.innerHTML = feed
    .map((f) => `<div class="feed-item ${f.kind}">${f.text}</div>`)
    .join("");
}

function paintRidges() {
  document.querySelectorAll<HTMLButtonElement>(".ridge").forEach((b) => {
    b.classList.toggle("active", b.dataset.ridge === ridge);
  });
}

function paintProducts() {
  document.querySelectorAll<HTMLButtonElement>("[data-paper]").forEach((b) => {
    b.classList.toggle("active", b.dataset.paper === paperTier);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-snap]").forEach((b) => {
    b.classList.toggle("active", b.dataset.snap === snapBand);
  });
  heatBtn.textContent = heatLev === 2 ? "HEAT 2×" : "HEAT 1×";
  heatBtn.classList.toggle("on", heatLev === 2);
  ashBalEl.textContent = money(ashBalance);
  snapStakeRow.hidden = snapBand === "off";
  const q = currentQuote();
  const bits = [`Ride ${q.notional}`];
  if (q.heatFee > 0) bits.push(`heat ${q.heatFee}`);
  if (q.paperPremium > 0) bits.push(`paper ${q.paperPremium}`);
  if (q.snapStake > 0) bits.push(`snap ${q.snapStake}`);
  if (q.ashApplied > 0) bits.push(`ash −${q.ashApplied}`);
  bits.push(`cash ${q.cashRequired}`);
  quoteEl.textContent = bits.join(" · ");
  loadoutCodeEl.textContent = currentLoadoutCode();
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
  app.classList.toggle("hot", dopa.heat > 55 || dopa.streak >= 3 || heatLev === 2);

  if (dopa.lastToast && now < dopa.toastUntil) {
    toastEl.hidden = false;
    toastEl.textContent = dopa.lastToast;
  } else {
    toastEl.hidden = true;
  }
}

function paintHud(now: number) {
  expireAshIfNeeded();
  balanceEl.textContent = money(balance);
  onlineEl.textContent = String(room.online + net.peerCount());
  roundEl.textContent = String(room.round);
  multEl.textContent = `${room.multiplier.toFixed(2)}×`;
  multEl.classList.toggle("hot", room.phase === "flying" && room.multiplier >= 2);
  multEl.classList.toggle("dead", room.phase === "crashed");
  paintRidges();
  paintProducts();
  paintDopa(now);

  historyEl.textContent = room.history.length
    ? room.history
        .slice(0, 8)
        .map((x) => `${x.toFixed(2)}×`)
        .join(" · ")
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
  const stakeLocked = lockedIn || pendingSend;
  const tag = loadoutTag({ paper: paperTier, heat: heatLev, snap: snapBand });

  if (room.phase === "countdown") {
    const sec = Math.ceil(Math.max(0, room.countdownEnds - now) / 1000);
    statusEl.textContent = lockedIn ? "SENT · WAITING" : "NEXT FUSE";
    hintEl.textContent = lockedIn
      ? `${tag} · ${sec}s`
      : ashBalance > 0
        ? `ASH ready · ${tag} · ${sec}s`
        : `${tag} · fuse in ${sec}s`;
    primaryBtn.textContent = lockedIn ? "SENT" : "SEND";
    primaryBtn.classList.toggle("armed", lockedIn || pendingSend);
    primaryBtn.disabled = lockedIn;
    peelBtn.disabled = true;
    cashoutBtn.disabled = true;
    crashAtEl.textContent = "—";
  } else if (room.phase === "flying") {
    const you = youRiding(room);
    statusEl.textContent = riding ? "HOLDING" : "WATCHING";
    hintEl.textContent = riding
      ? you?.paperActive
        ? `PAPER ${PAPER_TIERS[you.paperTier].label} · PEEL / CASH`
        : "PEEL / CASH · CASH voids PAPER"
      : pendingSend
        ? "Queued for next fuse"
        : "SEND queues next fuse";
    primaryBtn.textContent = riding ? "LIVE" : pendingSend ? "QUEUED" : "SEND NEXT";
    primaryBtn.classList.toggle("armed", pendingSend);
    primaryBtn.disabled = riding || pendingSend;
    peelBtn.disabled = !riding;
    cashoutBtn.disabled = !riding;
    peelBtn.classList.toggle("peel-live", riding);
    cashoutBtn.classList.toggle("live", riding);
    crashAtEl.textContent = "live";
  } else {
    statusEl.textContent = "SNAPPED";
    hintEl.textContent = pendingSend
      ? `Snap @ ${room.crashAt.toFixed(2)}× · queued`
      : `Snap @ ${room.crashAt.toFixed(2)}×`;
    primaryBtn.textContent = pendingSend ? "QUEUED" : "SEND NEXT";
    primaryBtn.classList.toggle("armed", pendingSend);
    primaryBtn.disabled = pendingSend;
    peelBtn.disabled = true;
    cashoutBtn.disabled = true;
    crashAtEl.textContent = `${room.crashAt.toFixed(2)}×`;
  }

  betInput.disabled = stakeLocked;
  heatBtn.disabled = stakeLocked;
  snapStakeInput.disabled = stakeLocked;
  document
    .querySelectorAll<HTMLButtonElement>(
      ".ridge, [data-bet-adj], [data-bet-set], [data-paper], [data-snap]",
    )
    .forEach((b) => {
      b.disabled = stakeLocked;
    });

  if (activePanel === "tape") renderTape();
  if (activePanel === "verify") renderVerify();
}

function tryLock() {
  if (lockedIn) return;

  if (room.phase !== "countdown") {
    if (pendingSend || youRiding(room)) return;
    const q = currentQuote();
    if (q.cashRequired > balance) {
      toast(dopa, "NEED MORE BANK", performance.now());
      return;
    }
    pendingSend = true;
    sfx.bet();
    toast(dopa, "QUEUED · NEXT FUSE", performance.now(), 900);
    pushFeed(
      `queued <span class="tag">${loadoutTag({ paper: paperTier, heat: heatLev, snap: snapBand })}</span>`,
      "peel",
    );
    return;
  }

  const q = currentQuote();
  if (q.cashRequired > balance) {
    toast(dopa, "NEED MORE BANK", performance.now());
    return;
  }

  const next = placeBet(room, {
    name: PLAYER,
    ridge,
    margin: q.margin,
    notional: q.notional,
    leverage: q.lev,
    paperTier: q.paperTier,
    ashApplied: q.ashApplied,
    snapBand,
  });
  if (!next) return;

  balance = Math.floor((balance - q.cashRequired) * 100) / 100;
  ashBalance = Math.floor((ashBalance - q.ashApplied) * 100) / 100;
  pendingSnapStake = q.snapStake;
  room = next;
  lockedIn = true;
  pendingSend = false;
  lastHeld = null;
  sfx.bet();
  renderer.pulse("bet");
  net.send({ type: "bet", id: net.selfId, name: PLAYER, ridge, bet: q.margin });
  const tag = loadoutTag({ paper: paperTier, heat: heatLev, snap: snapBand });
  pushFeed(`you <span class="tag">${tag}</span> M${q.margin}`, "peel");
  toast(dopa, heatLev === 2 ? "HEAT 2× SENT" : "SENT", performance.now(), 800);
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

  roundLog.unshift({
    round: room.round,
    seed: room.seed,
    seedHash: room.seedHash,
    crashAt: at,
    ridge: room.ridgeFocus,
  });
  if (roundLog.length > 40) roundLog.pop();

  const riding = youRiding(room);
  const youActor = room.actors.find((a) => a.you);
  const bandForSnap = youActor?.snapBand ?? snapBand;
  const snapStake = pendingSnapStake;
  if (snapStake > 0 && bandForSnap !== "off") {
    const win = snapPays(at, bandForSnap, snapStake);
    if (win > 0) {
      balance = Math.floor((balance + win) * 100) / 100;
      pushFeed(
        `SNAP ${SNAP_BANDS[bandForSnap].label} hit +${money(win)}`,
        "cash",
      );
      toast(dopa, `SNAP +${money(win)}`, now, 1100);
    } else {
      pushFeed(`SNAP ${SNAP_BANDS[bandForSnap].label} miss`, "bust");
    }
  }
  pendingSnapStake = 0;

  if (riding) {
    const settle = settleBust({
      remainingNotional: riding.remaining,
      lev: riding.leverage,
      paperTier: riding.paperTier,
      paperActive: riding.paperActive,
    });
    if (settle.paperPay > 0) {
      balance = Math.floor((balance + settle.paperPay) * 100) / 100;
      pushFeed(`PAPER paid ${money(settle.paperPay)}`, "cash");
      toast(dopa, `PAPER +${money(settle.paperPay)}`, now, 1100);
    }
    if (settle.ashCredit > 0) {
      ashBalance = Math.floor((ashBalance + settle.ashCredit) * 100) / 100;
      ashExpiresRound = room.round + 1;
      pushFeed(`ASH +${money(settle.ashCredit)} · next fuse`, "peel");
    }
    dopa = onLoss(dopa, at, lastHeld, now);
    if (dopa.nearMiss) sfx.nearMiss();
    pushFeed(`snapped @ ${at.toFixed(2)}×`, "bust");
  }
  lockedIn = false;
  room = clearYou(room);
}

function maybeAutobuy() {
  if (room.phase !== "countdown" || lockedIn) return;
  if (autoInput.checked || pendingSend) tryLock();
}

function announcePackJoins() {
  const waiting = room.actors.filter((a) => a.bot).slice(0, 5);
  for (const a of waiting) {
    const tag = loadoutTag({
      paper: a.paperTier,
      heat: a.leverage,
      snap: a.snapBand,
    });
    pushFeed(`${a.name} <span class="tag">${tag}</span> ${a.bet}`, "peel");
  }
}

function showPanel(id: string) {
  activePanel = id;
  document.querySelectorAll<HTMLButtonElement>(".itab").forEach((b) => {
    b.classList.toggle("active", b.dataset.panel === id);
  });
  el("#panel-play").hidden = id !== "play";
  el("#panel-pay").hidden = id !== "pay";
  el("#panel-myths").hidden = id !== "myths";
  el("#panel-tape").hidden = id !== "tape";
  el("#panel-verify").hidden = id !== "verify";
  el("#panel-lab").hidden = id !== "lab";
  if (id === "pay") renderPay();
  if (id === "myths") renderMyths();
  if (id === "tape") renderTape();
  if (id === "verify") renderVerify();
}

function renderPay() {
  const e = RIDGES[ridge].houseEdge;
  const rows: string[] = [];
  rows.push(
    `<div class="pay-row">HEAT fee = ${(HEAT_FEE_RATE * 100).toFixed(0)}% × (L−1) × margin · ASH = ${(ASH_RATE * 100).toFixed(0)}% of margin lost · next fuse only</div>`,
  );
  for (const tier of ["half", "full"] as PaperTier[]) {
    const t = PAPER_TIERS[tier];
    const targets = [1.5, 2, 5];
    const fairBits = targets
      .map((T) => {
        const fair = fairPaperPi(e, t.alpha, T);
        return `T${T.toFixed(1)} fair ${fair.toFixed(2)}`;
      })
      .join(" · ");
    const vig = targets
      .map((T) => {
        const fair = fairPaperPi(e, t.alpha, T);
        return `+${((t.pi - fair) * 100).toFixed(0)}pts@${T}`;
      })
      .join(" ");
    rows.push(
      `<div class="pay-row"><strong>PAPER ${t.label}</strong> sold π=${t.pi} α=${t.alpha}<br/>${fairBits}<br/><span style="color:var(--copper)">vig vs hold-to-T: ${vig}</span></div>`,
    );
  }
  for (const [id, b] of Object.entries(SNAP_BANDS)) {
    rows.push(
      `<div class="pay-row">SNAP ${b.label} (${b.blurb}) pays ${b.odds}× · ~17% hold target · id=${id}</div>`,
    );
  }
  payBody.innerHTML = rows.join("");
}

function renderMyths() {
  mythsBody.innerHTML = MYTHS.map(
    (m) => `
    <div class="myth-card" data-myth="${m.id}">
      <strong>${m.name}</strong>
      <div>${m.blurb}</div>
      <div style="color:var(--fog);margin-top:4px">“${m.claim}”</div>
      <button type="button" class="btn ghost" data-myth-apply="${m.id}">RUN THIS SYSTEM</button>
    </div>`,
  ).join("");
  mythsBody.querySelectorAll<HTMLButtonElement>("[data-myth-apply]").forEach((btn) => {
    btn.addEventListener("click", () => applyMyth(btn.dataset.mythApply ?? ""));
  });
}

function applyMyth(id: string) {
  if (id === "halfchad") {
    paperTier = "half";
    heatLev = 1;
    snapBand = "off";
    ridge = "rise";
  } else if (id === "ashloop") {
    paperTier = "off";
    heatLev = 2;
    snapBand = "off";
    ridge = "spike";
  } else if (id === "coldtape") {
    paperTier = "half";
    heatLev = 2;
    snapBand = "moon";
    snapStakeInput.value = "2";
    ridge = "rise";
  } else if (id === "voidvig") {
    paperTier = "full";
    heatLev = 1;
    snapBand = "off";
    ridge = "calm";
  }
  paintProducts();
  paintRidges();
  showPanel("play");
  toast(dopa, `SYSTEM · ${id.toUpperCase()}`, performance.now(), 900);
}

function renderTape() {
  const bands = heatmap(room.history);
  if (!room.history.length) {
    tapeBody.innerHTML =
      '<div class="pay-row">No snaps yet — play a few fuses.</div>';
    return;
  }
  tapeBody.innerHTML = bands
    .map(
      (b) => `
    <div class="heat-bar-row">
      <span>${b.label}</span>
      <div class="heat-track"><div class="heat-fill-band" style="width:${b.pct}%"></div></div>
      <span>${b.pct}%</span>
    </div>`,
    )
    .join("");
}

function renderVerify() {
  if (!roundLog.length) {
    verifyBody.innerHTML =
      '<div class="pay-row">No sealed rounds yet.</div>';
    return;
  }
  verifyBody.innerHTML = roundLog
    .slice(0, 12)
    .map((r) => {
      const v = verifyRound(r);
      const cls = v.ok ? "verify-ok" : "verify-bad";
      return `<div class="verify-row ${cls}">#${r.round} crash ${r.crashAt.toFixed(2)}× · seed ${r.seed.toString(16)} · hash ${r.seedHash}<br/>recompute ${v.recomputed.toFixed(2)}× · hash ${v.hashOk ? "OK" : "BAD"} · ${v.ok ? "PASS" : "FAIL"}</div>`;
    })
    .join("");
}

function runLab() {
  const targetT = Math.max(1.1, Number(labT.value) || 2);
  const res = runEvLab({
    margin: readMargin(),
    ridge,
    heat: heatLev,
    paper: paperTier,
    targetT,
    snap: snapBand,
    snapStake: readSnapStake(),
  });
  labOut.textContent = [
    `code ${currentLoadoutCode()}`,
    `notional ${res.notional} · outlay ${res.totalOutlay}`,
    `heat fee ${res.heatFee} · paper prem ${res.paperPrem} · snap ${res.snapStake}`,
    `fair π ${res.fairPi} · sold π ${res.soldPi} · vig ${res.paperVigPts} pts`,
    `est EV ${res.estEvPctOfMargin}% of margin`,
    res.note,
  ].join("\n");
}

net.onMessage = (m) => {
  if (m.type === "bet") pushFeed(`${m.name} sent on ${m.ridge}`, "peel");
  if (m.type === "cash")
    pushFeed(`${m.id.slice(0, 4)} out @ ${m.at.toFixed(2)}×`, "cash");
  if (m.type === "peel")
    pushFeed(`${m.id.slice(0, 4)} peeled @ ${m.at.toFixed(2)}×`, "peel");
};

let prevPhase = room.phase;

function frame(now: number) {
  const { room: next, events } = tickRoom(room, now);
  room = next;

  for (const ev of events) {
    if (
      ev.type === "countdown" &&
      Math.floor(ev.t / 1000) !== Math.floor((ev.t + 16) / 1000)
    ) {
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
      const tag = loadoutTag({
        paper: ev.actor.paperTier,
        heat: ev.actor.leverage,
        snap: ev.actor.snapBand,
      });
      pushFeed(
        `${ev.actor.name} <span class="tag">${tag}</span> peel @ ${ev.at.toFixed(2)}×`,
        "peel",
      );
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
    if (ev.type === "crash") {
      onRoundCrash(ev.at, now);
    }
    if (ev.type === "round_reset") {
      lastTickBeep = 0;
      lastMilestone = 1;
      lastHeld = null;
      expireAshIfNeeded();
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
heatBtn.addEventListener("click", () => {
  if (lockedIn || pendingSend) return;
  heatLev = heatLev === 1 ? 2 : 1;
  paintProducts();
});

document.querySelectorAll<HTMLButtonElement>("[data-paper]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (lockedIn || pendingSend) return;
    paperTier = (btn.dataset.paper as PaperTier) ?? "off";
    paintProducts();
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-snap]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (lockedIn || pendingSend) return;
    snapBand = (btn.dataset.snap as SnapBand) ?? "off";
    paintProducts();
  });
});

document.querySelectorAll<HTMLButtonElement>(".ridge").forEach((btn) => {
  btn.addEventListener("click", () => {
    ridge = (btn.dataset.ridge as RidgeId) ?? "rise";
    paintRidges();
    paintProducts();
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-bet-adj]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const adj = Number(btn.dataset.betAdj);
    betInput.value = String(
      Math.max(1, readMargin() + adj * (readMargin() >= 25 ? 5 : 1)),
    );
    paintProducts();
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-bet-set]").forEach((btn) => {
  btn.addEventListener("click", () => {
    betInput.value = btn.dataset.betSet ?? "10";
    paintProducts();
  });
});

betInput.addEventListener("input", () => paintProducts());
snapStakeInput.addEventListener("input", () => paintProducts());

document.querySelectorAll<HTMLButtonElement>(".itab").forEach((btn) => {
  btn.addEventListener("click", () => showPanel(btn.dataset.panel ?? "play"));
});

el("#lab-run").addEventListener("click", runLab);
el("#lab-apply").addEventListener("click", () => {
  const d = decodeLoadout(labCode.value);
  if (!d) {
    labOut.textContent = "Bad code. Example: SI-R2-PH-M10-SK2";
    return;
  }
  ridge = d.ridge;
  heatLev = d.heat;
  paperTier = d.paper;
  betInput.value = String(d.margin);
  snapBand = d.snap;
  if (d.snapStake) snapStakeInput.value = String(d.snapStake);
  paintProducts();
  paintRidges();
  labOut.textContent = `Applied ${encodeLoadout(d)}`;
});
el("#lab-copy").addEventListener("click", async () => {
  const code = currentLoadoutCode();
  try {
    await navigator.clipboard.writeText(code);
    toast(dopa, "CODE COPIED", performance.now(), 800);
  } catch {
    labCode.value = code;
    toast(dopa, "CODE IN LAB FIELD", performance.now(), 800);
  }
});
loadoutCodeEl.addEventListener("click", () => el<HTMLButtonElement>("#lab-copy").click());

window.addEventListener("resize", () => renderer.resize(canvas));
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (youRiding(room)) doCash();
    else tryLock();
  }
  if (e.code === "KeyP") doPeel();
  if (e.code === "KeyH" && !lockedIn && !pendingSend) {
    heatLev = heatLev === 1 ? 2 : 1;
    paintProducts();
  }
  if (e.code === "Digit1") ridge = "calm";
  if (e.code === "Digit2") ridge = "rise";
  if (e.code === "Digit3") ridge = "spike";
  paintRidges();
});

window.addEventListener(
  "pointerdown",
  () => {
    sfx.bet();
  },
  { once: true },
);

announcePackJoins();
renderMyths();
paintHud(performance.now());
requestAnimationFrame(frame);
