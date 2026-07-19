import type { RidgeId } from "./ridges";

/** Local multiplayer via BroadcastChannel — open 2 tabs to share a room feel */
export type NetMsg =
  | { type: "hello"; id: string; name: string }
  | { type: "bet"; id: string; name: string; ridge: RidgeId; bet: number }
  | { type: "cash"; id: string; at: number }
  | { type: "peel"; id: string; at: number };

export type Peer = { id: string; name: string; lastSeen: number };

export class LiveNet {
  private ch: BroadcastChannel | null = null;
  private id = `p-${Math.random().toString(36).slice(2, 8)}`;
  peers = new Map<string, Peer>();
  onMessage: ((m: NetMsg) => void) | null = null;

  constructor(private playerName: string) {
    if (typeof BroadcastChannel === "undefined") return;
    this.ch = new BroadcastChannel("sendit-live-pack");
    this.ch.onmessage = (ev) => {
      const m = ev.data as NetMsg;
      if ("id" in m && m.id === this.id) return;
      if (m.type === "hello" || m.type === "bet") {
        this.peers.set(m.id, {
          id: m.id,
          name: m.name,
          lastSeen: performance.now(),
        });
      }
      this.onMessage?.(m);
    };
    this.hello();
    setInterval(() => this.hello(), 2000);
  }

  get selfId() {
    return this.id;
  }

  hello() {
    this.send({ type: "hello", id: this.id, name: this.playerName });
  }

  send(m: NetMsg) {
    this.ch?.postMessage(m);
  }

  peerCount() {
    const now = performance.now();
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > 6000) this.peers.delete(id);
    }
    return this.peers.size;
  }
}
