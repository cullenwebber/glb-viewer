export const BRIDGE_KEY: string;
export const physicalInputs: Record<
  string,
  [string, string, number | number[]]
>;
export type MaterialPlan = {
  renderSettings?: {
    side: number;
    alphaTest: number;
    depthWrite: boolean;
    vertexColors: boolean;
    flatShading: boolean;
  };
  transparent: boolean | null;
  id: string;
  name: string;
  steps: {
    id: string;
    op: string;
    kind: string;
    args: string[];
    value?: number | number[];
    from?: number;
    to?: number;
    interpolation?: string;
  }[];
  outputs: Record<string, string>;
  parameters: { id: string; label: string; value: number }[];
  nodes: {
    id: string;
    label: string;
    type: string;
    connected: boolean;
    position: number[];
    inputs: { name: string; source: string; socket: string }[];
  }[];
};
export function compileMaterialGraph(raw: unknown): MaterialPlan;
export function materialModule(raw: unknown): string;
export function inspectMaterialGraph(raw: unknown): MaterialPlan["nodes"];
