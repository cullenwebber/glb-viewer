import type { MeshMetric } from "./performance";
import type { BridgeMaterialReport } from "../../electron/pipeline/material-runtime.mjs";
import type { MaterialGraph } from "../lib/material-editor";
export type SceneNode = {
  id: string;
  name: string;
  depth: number;
  mesh: boolean;
  bone: boolean;
  sourceIndex: number | null;
};
export type ViewerState = {
  sceneCameras: { id: string; name: string }[];
  sceneLights: { id: string; name: string; type: string }[];
  sceneCameraId: string;
  sceneLightsEnabled: boolean;
  sceneHelpers: boolean;
  materialSlots: { key: string; name: string; graph: MaterialGraph }[];
  rendererBackend: string;
  bridgeMaterials: BridgeMaterialReport[];
  name: string;
  size: number;
  demo: boolean;
  optimized: boolean;
  loading: boolean;
  error: string | null;
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  textures: number;
  dimensions: string;
  nodes: SceneNode[];
  nodeCount: number;
  clips: { name: string; duration: number }[];
  clipIndex: number;
  playing: boolean;
  time: number;
  duration: number;
  fps: number;
  drawCalls: number;
  modelDrawCalls: number;
  selectedId: string | null;
  selectedName: string | null;
  meshMetrics: MeshMetric[];
  textureBytes: number;
  geometryBytes: number;
  frameMs: number;
  renderMs: number;
  timings: {
    readMs: number;
    decodeMs: number;
    compileMs: number;
    firstRenderMs: number;
  } | null;
  isolatedId: string | null;
};
export type DisplaySettings = {
  inspection:
    | "material"
    | "baseColor"
    | "roughness"
    | "metalness"
    | "normalMap"
    | "normals"
    | "ao"
    | "alpha"
    | "checker"
    | "orientation"
    | "weights"
    | "cost";
  uvSet: number;
  costMetric: "triangles" | "materials" | "textures";
  weightBone: string;
  normals: "off" | "vertex" | "face";
  normalLength: number;
  normalsSelectedOnly: boolean;
  bones: boolean;
  overlayInFront: boolean;
  grid: boolean;
  wireframe: boolean;
  rotate: boolean;
  background: string;
  environment: "studio" | "neutral" | "direct";
  exposure: number;
  shadows: boolean;
  transparency: boolean;
  transmission: boolean;
  pixelRatio: number;
};
export const defaultDisplay: DisplaySettings = {
  inspection: "material",
  uvSet: 0,
  costMetric: "triangles",
  weightBone: "",
  normals: "off",
  normalLength: 2,
  normalsSelectedOnly: false,
  bones: false,
  overlayInFront: true,
  grid: true,
  wireframe: false,
  rotate: false,
  background: "#0a0a0a",
  environment: "studio",
  exposure: 1,
  shadows: false,
  transparency: true,
  transmission: true,
  pixelRatio: 1.5,
};
export const initialViewerState: ViewerState = {
  sceneCameras: [],
  sceneLights: [],
  sceneCameraId: "",
  sceneLightsEnabled: true,
  sceneHelpers: false,
  materialSlots: [],
  rendererBackend: "Initializing GPU…",
  bridgeMaterials: [],
  name: "Studio sample",
  size: 0,
  demo: true,
  optimized: false,
  loading: false,
  error: null,
  triangles: 0,
  vertices: 0,
  meshes: 0,
  materials: 0,
  textures: 0,
  dimensions: "—",
  nodes: [],
  nodeCount: 0,
  clips: [],
  clipIndex: 0,
  playing: false,
  time: 0,
  duration: 0,
  fps: 0,
  drawCalls: 0,
  modelDrawCalls: 0,
  selectedId: null,
  selectedName: null,
  meshMetrics: [],
  textureBytes: 0,
  geometryBytes: 0,
  frameMs: 0,
  renderMs: 0,
  timings: null,
  isolatedId: null,
};
