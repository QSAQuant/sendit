export type RidgeId = "calm" | "rise" | "spike";

export type RidgeConfig = {
  id: RidgeId;
  label: string;
  growth: number;
  instantBust: number;
  houseEdge: number;
  color: string;
};

export const RIDGES: Record<RidgeId, RidgeConfig> = {
  calm: {
    id: "calm",
    label: "SLOW",
    growth: 0.000045,
    instantBust: 0.015,
    houseEdge: 0.03,
    color: "#3dff9a",
  },
  rise: {
    id: "rise",
    label: "SEND",
    growth: 0.00006,
    instantBust: 0.03,
    houseEdge: 0.04,
    color: "#ff5a1f",
  },
  spike: {
    id: "spike",
    label: "DEGEN",
    growth: 0.000095,
    instantBust: 0.05,
    houseEdge: 0.05,
    color: "#ff2d55",
  },
};

export const RIDGE_ORDER: RidgeId[] = ["calm", "rise", "spike"];

export function nextRidge(id: RidgeId): RidgeId {
  const i = RIDGE_ORDER.indexOf(id);
  return RIDGE_ORDER[(i + 1) % RIDGE_ORDER.length];
}
