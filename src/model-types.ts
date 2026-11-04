export type ModelFile = {
  url: string;
  name: string;
  size: number;
  optimized?: boolean;
  sourceKey?: string;
  reloaded?: boolean;
  sample?: boolean;
};
export type TextureInfo = {
  id: number;
  inputOnly?: boolean;
  name: string;
  uri: string;
  mime: string;
  width: number;
  height: number;
  channels: number;
  bytes: number;
  thumbnail: string | null;
  slots: string[];
  uses: string[];
  infos: {
    uv: number;
    wrapS: number;
    wrapT: number;
    minFilter: number | null;
    magFilter: number | null;
  }[];
  colorSpace: string;
  warning: string | null;
  editable: boolean;
};
export type Analysis = {
  name: string;
  beforeBytes: number;
  sourceFiles: number;
  meshes: MeshInfo[];
  animations: { name: string; channels: number }[];
  textures: TextureInfo[];
  materials: {
    id: number;
    name: string;
    occlusion: number;
    metallicRoughness: number;
  }[];
};
export type TextureCompression = {
  quality?: number;
  effort?: number;
  uastcLevel?: number;
  rdo?: boolean;
  rdoLambda?: number;
  mipmaps?: boolean;
  lossless?: boolean;
  pngLevel?: number;
};
export type GeometryCompression = {
  meshoptLevel?: "medium" | "high";
  encodeSpeed?: number;
  decodeSpeed?: number;
  quantizePosition?: number;
  quantizeNormal?: number;
  quantizeTexcoord?: number;
};
export type TextureSetting = {
  id: number;
  maxSize: number;
  format: string;
  compression?: TextureCompression;
  remove?: boolean;
};
export type ChannelSource = {
  texture: number | null;
  channel: number;
  value: number;
};
export type Pack = {
  name: string;
  material: number;
  target: string;
  size: number;
  format: string;
  channels: ChannelSource[];
  compression?: TextureCompression;
};
export type Plan = {
  geometry: string;
  geometryOptions?: GeometryCompression;
  optimization?: OptimizationOptions;
  textures: TextureSetting[];
  packs: Pack[];
};
export type Comparison = {
  key: string;
  name: string;
  beforeBytes: number;
  afterBytes: number;
  beforeWidth: number;
  beforeHeight: number;
  outputId: number | null;
  after: TextureInfo | null;
};
export type Report = {
  beforeBytes: number;
  afterBytes: number;
  beforeTextureBytes: number;
  afterTextureBytes: number;
  comparisons: Comparison[];
  textures: TextureInfo[];
  geometry: string;
  warnings?: string[];
  beforeMeshes?: MeshInfo[];
  afterMeshes?: MeshInfo[];
  lods?: { name: string; ratio: number; size: number; meshes: MeshInfo[] }[];
};
export type HistoryRun = {
  id: string;
  sourceKey: string;
  name: string;
  createdAt: string;
  recipe: Recipe;
  report: Report;
};
export type ProjectBudget = {
  id: string;
  name: string;
  fileBytes: number;
  textureBytes: number;
  triangles: number;
  drawCalls: number;
};
export type BatchRow = {
  index: number;
  name: string;
  status: string;
  message?: string;
  beforeBytes?: number;
  afterBytes?: number;
  warnings?: string[];
  budgets?: {
    key: string;
    limit: number;
    actual: number | null;
    exceeded: boolean;
  }[];
};
export type UpdateState = {
  version: string;
  status: string;
  automatic: boolean;
  availableVersion: string | null;
  progress: number;
  error: string | null;
  url: string;
};
export interface DesktopApi {
  updateState(): Promise<UpdateState>;
  checkUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<void>;
  openReleases(): Promise<void>;
  onUpdate(callback: (state: UpdateState) => void): () => void;
  onShowUpdates(callback: () => void): () => void;
  listHistory(key: string): Promise<HistoryRun[]>;
  saveHistory(token: string, recipe: Recipe): Promise<HistoryRun>;
  renameHistory(id: string, name: string): Promise<HistoryRun>;
  deleteHistory(id: string): Promise<void>;
  historyBytes(id: string): Promise<Uint8Array>;
  restoreHistory(
    token: string,
    id: string,
  ): Promise<{ report: Report; recipe: Recipe }>;
  listBudgets(): Promise<ProjectBudget[]>;
  saveBudget(value: Partial<ProjectBudget>): Promise<ProjectBudget>;
  deleteBudget(id: string): Promise<void>;
  chooseBatch(): Promise<{ id: string; names: string[] } | null>;
  runBatch(
    id: string,
    preset: string,
    budget: string,
  ): Promise<{ rows?: BatchRow[]; output: string; cancelled?: boolean } | null>;
  cancelBatch(): Promise<void>;
  onBatchProgress(callback: (row: BatchRow) => void): () => void;
  checkModel(token: string, output?: boolean): Promise<CheckReport>;
  watchModel(token: string, enabled: boolean): Promise<WatchState>;
  watchState(): Promise<WatchState>;
  onWatchError(callback: (message: string) => void): () => void;
  listPresets(): Promise<Preset[]>;
  savePreset(preset: {
    id?: string;
    name: string;
    recipe: Recipe;
  }): Promise<Preset>;
  deletePreset(id: string): Promise<void>;
  importPreset(): Promise<Preset | null>;
  exportPreset(preset: Preset): Promise<string | null>;
  getRecipe(key: string): Promise<Recipe | null>;
  saveRecipe(key: string, recipe: Recipe): Promise<void>;
  exportBundle(token: string): Promise<string | null>;
  chooseModel(): Promise<ModelFile | null>;
  openFile(file: File): Promise<ModelFile>;
  onOpen(callback: (file: ModelFile) => void): () => void;
  importTextures(token: string): Promise<Analysis | null>;
  analyzeModel(token: string): Promise<Analysis>;
  optimizeModel(token: string, plan: Plan): Promise<Report>;
  cancelOptimization(token: string): Promise<void>;
  textureImage(
    token: string,
    id: number,
    output: boolean,
  ): Promise<{ bytes: Uint8Array; mime: string }>;
  optimizedBytes(token: string): Promise<Uint8Array>;
  exportOptimized(token: string): Promise<string | null>;
  onOptimizerProgress(
    callback: (event: { token: string; message: string }) => void,
  ): () => void;
}
declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}

export type MeshInfo = {
  id: number;
  key: string;
  name: string;
  nodeNames: string[];
  triangles: number;
  vertices: number;
  primitives: number;
  skinned: boolean;
  morphTargets: boolean;
};
export type MeshOptimization = {
  key: string;
  protected?: boolean;
  ratio?: number;
};
export type OptimizationOptions = {
  dedup?: boolean;
  prune?: boolean;
  cleanAttributes?: boolean;
  singleSided?: { key: string; primitive: number }[];
  resample?: boolean;
  merge?: boolean;
  instance?: boolean;
  preserveNamed?: boolean;
  ratio?: number;
  error?: number;
  lockBorder?: boolean;
  meshes?: MeshOptimization[];
  lods?: number[];
};
export type CheckFix =
  | { kind: "cleanAttributes" }
  | { kind: "singleSided"; key: string; primitive: number };
export type CheckIssue = {
  fix?: CheckFix;
  id: string;
  severity: number;
  code: string;
  message: string;
  pointer?: string;
  nodeIndex: number | null;
  source: string;
};
export type CheckReport = {
  validatorVersion: string;
  errors: number;
  warnings: number;
  infos: number;
  issues: CheckIssue[];
  truncated: boolean;
  decoders: string[];
  extensions: string[];
  animations: { name: string; channels: number }[];
  units: string;
  checkedAt: string;
  rendererVersion: string;
};
export type Recipe = {
  version: 1;
  geometry: string;
  geometryOptions: GeometryCompression;
  optimization: OptimizationOptions;
  textureRules: {
    identity: string;
    slots: string[];
    settings: Omit<TextureSetting, "id">;
  }[];
  packs: {
    name: string;
    material: string;
    target: string;
    size: number;
    format: string;
    compression?: TextureCompression;
    channels: { identity: string | null; channel: number; value: number }[];
  }[];
};
export type Preset = {
  id: string;
  name: string;
  recipe: Recipe;
  updatedAt: string;
};
export type WatchState = { enabled: boolean; name: string | null };
