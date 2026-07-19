/** Tiny WebAudio synth — no asset files, instant dopamine hits */
export class Sfx {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensure() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  private beep(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain = 0.05,
    slide = 0,
  ) {
    if (this.muted) return;
    const ctx = this.ensure();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, ctx.currentTime + dur);
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  tick(mult: number) {
    // Rising pitch — jet engine climb
    const f = 160 + Math.min(mult, 12) * 55;
    this.beep(f, 0.035, "sawtooth", 0.018 + Math.min(mult, 8) * 0.002);
  }

  milestone(mult: number) {
    const f = 400 + mult * 40;
    this.beep(f, 0.07, "triangle", 0.055);
    setTimeout(() => this.beep(f + 80, 0.06, "triangle", 0.04), 40);
  }

  ignite() {
    this.beep(120, 0.12, "sawtooth", 0.06, 200);
    setTimeout(() => this.beep(280, 0.08, "square", 0.04), 50);
  }

  bet() {
    this.beep(420, 0.08, "triangle", 0.05);
  }

  peel() {
    this.beep(660, 0.1, "sawtooth", 0.04, 120);
  }

  cash(big: boolean) {
    this.beep(big ? 880 : 720, 0.12, "triangle", 0.06);
    if (big) setTimeout(() => this.beep(1100, 0.14, "triangle", 0.05), 80);
  }

  crash() {
    this.beep(90, 0.25, "sawtooth", 0.07, -40);
  }

  nearMiss() {
    this.beep(300, 0.08, "square", 0.04);
    setTimeout(() => this.beep(240, 0.12, "square", 0.04), 70);
  }

  streak() {
    this.beep(520, 0.06, "triangle", 0.05);
    setTimeout(() => this.beep(680, 0.08, "triangle", 0.05), 60);
    setTimeout(() => this.beep(860, 0.1, "triangle", 0.05), 120);
  }

  countdown() {
    this.beep(200, 0.05, "square", 0.03);
  }
}
