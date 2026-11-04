import type { Object3D, Texture } from "three";
import type { MaterialPlan } from "./material-graph.mjs";
export type BridgeMaterialReport = {
  key: string;
  id: string;
  name: string;
  status: "translated" | "fallback";
  message: string;
  nodes: MaterialPlan["nodes"];
  parameters: MaterialPlan["parameters"];
};
export type BridgeMaterials = {
  reports: BridgeMaterialReport[];
  setParameter(key: string, id: string, value: number): void;
  dispose(): void;
};
export function applyBridgeMaterials(
  root: Object3D,
  options?: {
    loadKTX2?: (url: string) => Promise<Texture>;
    resolveTexture?: (reference: string) => Texture | Promise<Texture>;
  },
): Promise<BridgeMaterials>;
