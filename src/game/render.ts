import type { Actor } from "./actors";
import type { RidgeId } from "./ridges";
import type { RoomPhase } from "./room";

export type RenderFrame = {
  phase: RoomPhase;
  multiplier: number;
  ridge: RidgeId;
  crashAt: number;
  actors: Actor[];
  heat: number;
  countdown: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: "flame" | "ember" | "smoke";
};

const MAX_PARTICLES = 160;

export class SurgeRenderer {
  private ctx: CanvasRenderingContext2D;
  private trail: { x: number; y: number }[] = [];
  private particles: Particle[] = [];
  private flash = 0;
  private shake = 0;
  private glow = 0;
  private w = 720;
  private h = 420;
  private time = 0;
  private lastHead = { x: 0, y: 0 };
  private hasHead = false;
  private boomEmitted = false;
  private lastPhase: RoomPhase | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.resize(canvas);
  }

  resize(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    this.w = Math.max(320, Math.floor(rect.width * dpr));
    this.h = Math.max(180, Math.floor(rect.height * dpr));
    canvas.width = this.w;
    canvas.height = this.h;
  }

  pulse(kind: "crash" | "cash" | "peel" | "bet") {
    this.flash = kind === "crash" ? -1 : kind === "peel" ? 0.55 : 1;
    if (kind === "crash") {
      this.shake = 14;
      this.glow = 1;
    }
    if (kind === "cash") {
      this.shake = 7;
      this.glow = 0.7;
    }
    if (kind === "bet") this.glow = 0.4;
  }

  resetTrail() {
    this.trail = [];
    this.particles = [];
    this.hasHead = false;
    this.boomEmitted = false;
  }

  draw(frame: RenderFrame) {
    const { ctx, w, h } = this;
    this.time += 1;

    if (this.lastPhase !== frame.phase) {
      if (frame.phase === "flying") {
        this.boomEmitted = false;
        this.hasHead = false;
      }
      if (frame.phase === "countdown") {
        this.trail = [];
        this.particles = [];
        this.boomEmitted = false;
        this.hasHead = false;
      }
      this.lastPhase = frame.phase;
    }

    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.shake *= 0.84;
    if (this.shake < 0.3) this.shake = 0;
    this.glow *= 0.92;

    ctx.setTransform(1, 0, 0, 1, sx, sy);
    ctx.clearRect(-30, -30, w + 60, h + 60);

    const heat = frame.heat / 100;
    const flying = frame.phase === "flying";
    const crashed = frame.phase === "crashed";
    const mult = Math.max(1, frame.multiplier);

    const g = ctx.createRadialGradient(
      w * 0.55,
      h * 0.35,
      20,
      w * 0.5,
      h * 0.5,
      w * 0.8,
    );
    if (flying) {
      g.addColorStop(0, `rgb(${50 + heat * 40}, ${18 + Math.min(mult, 10) * 2}, 8)`);
      g.addColorStop(0.45, "#120806");
      g.addColorStop(1, "#070708");
    } else if (crashed) {
      g.addColorStop(0, "#2a0810");
      g.addColorStop(1, "#070708");
    } else {
      g.addColorStop(0, "#141418");
      g.addColorStop(1, "#070708");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(heat, flying);

    const headX = this.pad + this.multToT(mult) * (w - this.pad * 2);
    const headY = this.multToY(mult);

    if (flying || crashed) {
      this.trail.push({ x: headX, y: headY });
      if (this.trail.length > 80) this.trail.shift();

      if (flying) {
        let bx = -0.7;
        let by = 0.7;
        if (this.hasHead) {
          const dx = headX - this.lastHead.x;
          const dy = headY - this.lastHead.y;
          const len = Math.hypot(dx, dy);
          if (len > 0.01) {
            bx = -dx / len;
            by = -dy / len;
          }
        }
        // Emit every other frame, capped count — prevents freeze
        if (this.time % 2 === 0 && this.particles.length < MAX_PARTICLES) {
          const intensity = 1 + Math.min(mult, 6) * 0.1;
          this.emitFire(headX, headY, bx, by, intensity);
        }
      }
      this.lastHead = { x: headX, y: headY };
      this.hasHead = true;

      this.drawCharredWire();
      this.drawFireRibbon(crashed);
    } else {
      this.drawWireGuide();
    }

    for (const a of frame.actors) {
      if (a.status === "waiting") continue;
      if (a.status === "riding" || a.status === "peeled") {
        const ay = headY + (a.you ? 0 : (hash(a.id) % 17) - 8);
        this.drawRider(headX, ay, a, true);
      } else if (a.exitAt) {
        const ax = this.pad + this.multToT(a.exitAt) * (w - this.pad * 2);
        const ay = this.multToY(a.exitAt) + (hash(a.id) % 17) - 8;
        this.drawRider(ax, ay, a, false);
      }
    }

    if (flying) this.drawJetman(headX, headY, mult);
    if (crashed) {
      this.drawBoom(headX, headY);
      this.drawCrashMarker(frame.crashAt);
      if (!this.boomEmitted) {
        this.emitExplosion(headX, headY);
        this.boomEmitted = true;
      }
    }

    if (frame.phase === "countdown") this.drawCountdown(frame.countdown);

    this.stepParticles();

    if (flying || this.glow > 0.05) {
      const bloom = flying
        ? 0.1 + Math.min(mult, 10) * 0.012 + this.glow * 0.15
        : this.glow * 0.2;
      ctx.fillStyle = `rgba(255, 90, 20, ${Math.min(bloom, 0.35)})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.flash !== 0) {
      ctx.fillStyle =
        this.flash < 0 ? "rgba(255,45,85,0.28)" : "rgba(255,176,32,0.18)";
      ctx.fillRect(0, 0, w, h);
      this.flash *= 0.8;
      if (Math.abs(this.flash) < 0.02) this.flash = 0;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private pushParticle(p: Particle) {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  private emitFire(
    x: number,
    y: number,
    bx: number,
    by: number,
    intensity: number,
  ) {
    const n = Math.min(6, Math.floor(5 * intensity));
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 1.1;
      const px = -by * spread;
      const py = bx * spread;
      const speed = 2 + Math.random() * 2.8 * intensity;
      const life = 0.4 + Math.random() * 0.35;
      this.pushParticle({
        x: x + (Math.random() - 0.5) * 5,
        y: y + (Math.random() - 0.5) * 5,
        vx: bx * speed + px * 2,
        vy: by * speed + py * 2 - Math.random(),
        life,
        maxLife: life,
        size: 5 + Math.random() * 6 * intensity,
        kind: "flame",
      });
    }
    if (Math.random() > 0.5) {
      this.pushParticle({
        x,
        y,
        vx: bx * 3.5 + (Math.random() - 0.5) * 2,
        vy: by * 3.5 - 2 - Math.random() * 2,
        life: 0.7,
        maxLife: 0.7,
        size: 2 + Math.random() * 2,
        kind: "ember",
      });
    }
    if (Math.random() > 0.65) {
      this.pushParticle({
        x: x + bx * 10,
        y: y + by * 10,
        vx: bx * 1.1 + (Math.random() - 0.5),
        vy: by * 1.1 - 0.6,
        life: 0.9,
        maxLife: 0.9,
        size: 7 + Math.random() * 8,
        kind: "smoke",
      });
    }
  }

  private emitExplosion(x: number, y: number) {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2.5 + Math.random() * 6;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 1,
        size: 4 + Math.random() * 8,
        kind: i % 3 === 0 ? "ember" : "flame",
      });
    }
  }

  private stepParticles() {
    const { ctx } = this;
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.kind === "flame") {
        p.vy -= 0.08;
        p.vx *= 0.98;
      } else if (p.kind === "smoke") {
        p.vy -= 0.05;
        p.size *= 1.015;
      } else {
        p.vy += 0.05;
      }
      p.life -= 0.03;
      if (p.life <= 0) continue;
      next.push(p);

      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);

      if (p.kind === "flame") {
        const col =
          t < 0.2
            ? "#fff6c8"
            : t < 0.45
              ? "#ffd23a"
              : t < 0.75
                ? "#ff5a1f"
                : "#ff2d55";
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y,
          p.size * (1 - t * 0.5) * 0.55,
          p.size * (1 - t * 0.3),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (p.kind === "ember") {
        ctx.fillStyle = "#ffb020";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * (1 - t)), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(80,70,65,${0.3 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this.particles = next;
  }

  private get pad() {
    return Math.floor(this.w * 0.08);
  }

  private multToT(m: number) {
    return Math.log(Math.min(Math.max(m, 1), 20)) / Math.log(20);
  }

  private multToY(m: number) {
    const t = this.multToT(m);
    const top = this.h * 0.16;
    const bottom = this.h * 0.78;
    return bottom - t * (bottom - top);
  }

  private drawGrid(heat: number, flying: boolean) {
    const { ctx, w, h } = this;
    ctx.strokeStyle = flying
      ? `rgba(255,90,20,${0.06 + heat * 0.08})`
      : "rgba(154,149,144,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const y = (h / 6) * i;
      ctx.beginPath();
      ctx.moveTo(this.pad, y);
      ctx.lineTo(w - this.pad, y);
      ctx.stroke();
    }
  }

  private drawWireGuide() {
    const { ctx, w, h } = this;
    ctx.strokeStyle = "rgba(244,240,230,0.14)";
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 10]);
    ctx.beginPath();
    ctx.moveTo(this.pad, h * 0.78);
    ctx.lineTo(w - this.pad, h * 0.16);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawCharredWire() {
    const { ctx, trail } = this;
    if (trail.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
    ctx.strokeStyle = "rgba(40,28,24,0.9)";
    ctx.lineWidth = Math.max(5, this.w * 0.012);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  private drawFireRibbon(crashed: boolean) {
    const { ctx, trail } = this;
    if (trail.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
    ctx.strokeStyle = crashed ? "#ff2d55" : "#ff5a1f";
    ctx.lineWidth = Math.max(10, this.w * 0.022);
    ctx.globalAlpha = 0.35;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = crashed ? "#ff2d55" : "#ff8a2a";
    ctx.lineWidth = Math.max(5, this.w * 0.012);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = crashed ? "#ff6b8a" : "#ffe566";
    ctx.lineWidth = Math.max(2, this.w * 0.005);
    ctx.stroke();
  }

  private drawJetman(x: number, y: number, mult: number) {
    const { ctx } = this;
    const s = Math.max(10, this.w * 0.022);
    const pulse = 1 + Math.sin(this.time * 0.4) * 0.08 + Math.min(mult, 6) * 0.02;

    const glow = ctx.createRadialGradient(x, y, 2, x, y, s * 4 * pulse);
    glow.addColorStop(0, "rgba(255,230,120,0.9)");
    glow.addColorStop(0.35, "rgba(255,90,20,0.55)");
    glow.addColorStop(1, "rgba(255,45,85,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, s * 4 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f4f0e6";
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.55, s * 0.85, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff5a1f";
    ctx.beginPath();
    ctx.arc(x + s * 0.15, y - s * 0.55, s * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe566";
    ctx.beginPath();
    ctx.arc(x + s * 0.25, y - s * 0.55, s * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2a2a2e";
    ctx.fillRect(x - s * 0.85, y - s * 0.2, s * 0.35, s * 0.7);
    ctx.fillRect(x - s * 1.15, y - s * 0.1, s * 0.28, s * 0.55);

    ctx.fillStyle = "#ffd23a";
    ctx.beginPath();
    ctx.arc(x - s * 0.7, y + s * 0.55, s * 0.18, 0, Math.PI * 2);
    ctx.arc(x - s * 1.0, y + s * 0.5, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBoom(x: number, y: number) {
    const { ctx } = this;
    const r = Math.max(20, this.w * 0.05);
    const g = ctx.createRadialGradient(x, y, 2, x, y, r * 3);
    g.addColorStop(0, "#fff6c8");
    g.addColorStop(0.3, "#ff5a1f");
    g.addColorStop(0.7, "#ff2d55");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawRider(x: number, y: number, a: Actor, live: boolean) {
    if (a.you && live) return;
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = live ? a.color : `${a.color}99`;
    ctx.fill();
    ctx.fillStyle = "rgba(244,240,230,0.9)";
    ctx.font = `${Math.max(10, this.w * 0.022)}px "IBM Plex Mono", monospace`;
    ctx.fillText(a.name, x + 8, y - 6);
    if (!live && a.exitAt) {
      ctx.fillStyle = a.status === "bust" ? "#ff2d55" : "#3dff9a";
      ctx.fillText(`${a.exitAt.toFixed(2)}×`, x + 8, y + 10);
    }
  }

  private drawCrashMarker(crashAt: number) {
    const y = this.multToY(crashAt);
    const { ctx, w } = this;
    ctx.fillStyle = "#ff2d55";
    ctx.font = `700 ${Math.floor(this.w * 0.03)}px "Archivo Black", sans-serif`;
    ctx.fillText(`SNAP ${crashAt.toFixed(2)}×`, w - this.pad - 150, y - 10);
  }

  private drawCountdown(ms: number) {
    const { ctx, w, h } = this;
    const sec = Math.ceil(ms / 1000);
    ctx.fillStyle = "rgba(7,7,8,0.55)";
    ctx.fillRect(0, 0, w, h);
    if (sec <= 1) {
      ctx.fillStyle = "rgba(255,90,20,0.12)";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = "#ff5a1f";
    ctx.font = `700 ${Math.floor(w * 0.14)}px "Archivo Black", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(sec > 0 ? String(sec) : "IGNITE", w / 2, h / 2 + 20);
    ctx.font = `600 ${Math.floor(w * 0.032)}px "Space Grotesk", sans-serif`;
    ctx.fillStyle = "#9a9590";
    ctx.fillText("LIGHT THE FUSE", w / 2, h / 2 - 36);
    ctx.textAlign = "left";
  }
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
