import { MaterialInspection } from "./material-inspection";
import { InspectionOverlays } from "./inspection-overlays";
import * as THREE from "three";
import {
  WebGPURenderer,
  PMREMGenerator,
  type MeshPhysicalNodeMaterial,
} from "three/webgpu";
import {
  applyBridgeMaterials,
  type BridgeMaterials,
} from "../../electron/pipeline/material-runtime.mjs";
import {
  BRIDGE_KEY,
  compileMaterialGraph,
} from "../../electron/pipeline/material-graph.mjs";
import {
  createMaterialGraph,
  parseMaterialGraph,
  type MaterialGraph,
} from "../lib/material-editor";
import {
  geometryBytes,
  textureMemory,
  materialTextures,
  type MeshMetric,
} from "./performance";
import { ObjectSelection } from "./selection";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { useBundledWorker } from "../decoder-workers";
import type { ModelFile } from "../model-types";
import {
  defaultDisplay,
  initialViewerState,
  type DisplaySettings,
  type ViewerState,
  type SceneNode,
} from "./types";

export class ModelViewer {
  readonly renderer: WebGPURenderer;
  readonly ready: Promise<void>;
  private scene = new THREE.Scene();
  private selection = new ObjectSelection(this.scene);
  private inspection = new MaterialInspection();
  private comparison?: ModelViewer;
  private cameraLinked?: ModelViewer;
  private synchronizing = false;
  private overlays = new InspectionOverlays();
  private modelCalls = 0;
  private meshCalls = new Map<string, number>();
  private materialsState = new Map<
    THREE.Material,
    {
      transparent: boolean;
      transmission: number | undefined;
      transmissionNode?: MeshPhysicalNodeMaterial["transmissionNode"];
    }
  >();
  private isolatedVisibility = new Map<THREE.Object3D, boolean>();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  private sceneCamera?: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private sceneHelpers = new THREE.Group();
  private sceneHelperObjects: (
    | THREE.CameraHelper
    | THREE.PointLightHelper
    | THREE.SpotLightHelper
    | THREE.DirectionalLightHelper
  )[] = [];
  private get renderCamera() {
    return this.sceneCamera ?? this.camera;
  }
  private controls: OrbitControls;
  private environment?: THREE.Texture;
  private pmrem?: PMREMGenerator;
  private ambient = new THREE.HemisphereLight(0xffffff, 0x555b68, 0.6);
  private key = new THREE.DirectionalLight(0xffffff, 3);
  private grid = new THREE.GridHelper(12, 24, 0x303033, 0x18181b);
  private model?: THREE.Object3D;
  private bridge?: BridgeMaterials;
  private materialSources = new Map<string, THREE.Material>();
  private materialPreviews = new Map<
    string,
    {
      material: THREE.Material;
      source: THREE.Material;
      bridge: BridgeMaterials;
    }
  >();
  private materialRequests = new Map<string, number>();
  private mixer?: THREE.AnimationMixer;
  private action?: THREE.AnimationAction;
  private clips: THREE.AnimationClip[] = [];
  private observer: ResizeObserver;
  private draco = new DRACOLoader().setDecoderPath("./decoders/draco/");
  private ktx = new KTX2Loader().setTranscoderPath("./decoders/basis/");
  private state: ViewerState = { ...initialViewerState };
  private display = { ...defaultDisplay };
  private version = 0;
  private speed = 1;
  private disposed = false;
  constructor(
    private element: HTMLElement,
    private onChange: (state: ViewerState) => void,
    private onSource: (file: ModelFile) => void,
    private onDisplay?: (settings: DisplaySettings) => void,
  ) {
    this.renderer = new WebGPURenderer({ antialias: true });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.display.pixelRatio),
    );
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D model viewport",
    );
    element.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener("change", () => {
      const peer = this.cameraLinked;
      if (!peer || this.synchronizing) return;
      peer.synchronizing = true;
      peer.camera.position.copy(this.camera.position);
      peer.camera.quaternion.copy(this.camera.quaternion);
      peer.camera.near = this.camera.near;
      peer.camera.far = this.camera.far;
      peer.camera.fov = this.camera.fov;
      peer.camera.updateProjectionMatrix();
      peer.controls.minDistance = this.controls.minDistance;
      peer.controls.maxDistance = this.controls.maxDistance;
      peer.controls.target.copy(this.controls.target);
      peer.controls.update();
      peer.synchronizing = false;
    });
    let pointerStart = { x: 0, y: 0 };
    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    });
    this.renderer.domElement.addEventListener("pointerup", (event) => {
      if (
        this.display.inspection !== "weights" ||
        Math.hypot(
          event.clientX - pointerStart.x,
          event.clientY - pointerStart.y,
        ) > 4
      )
        return;
      const rect = this.renderer.domElement.getBoundingClientRect(),
        point = new THREE.Vector3();
      let nearest: THREE.Bone | undefined,
        distance = 14;
      this.model?.traverse((object) => {
        if (!(object as THREE.Bone).isBone) return;
        point
          .setFromMatrixPosition(object.matrixWorld)
          .project(this.renderCamera);
        const d = Math.hypot(
          rect.left + ((point.x + 1) * rect.width) / 2 - event.clientX,
          rect.top + ((1 - point.y) * rect.height) / 2 - event.clientY,
        );
        if (point.z >= -1 && point.z <= 1 && d < distance) {
          distance = d;
          nearest = object as THREE.Bone;
        }
      });
      if (nearest) this.selectObject(nearest.uuid);
    });
    this.controls.autoRotateSpeed = 1.3;
    this.scene.background = new THREE.Color(this.display.background);
    this.scene.add(
      this.ambient,
      this.key,
      this.grid,
      this.overlays.group,
      this.sceneHelpers,
    );
    this.key.position.set(3, 5, 4);
    this.key.visible = false;
    useBundledWorker(this.ktx, "init", "basis-worker.js");
    useBundledWorker(this.draco, "_initDecoder", "draco-worker.js");
    this.observer = new ResizeObserver(() => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (!width || !height) return;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.resizeSceneCamera();
    });
    this.observer.observe(element);
    const demo = new THREE.Group();
    demo.name = "Studio sample";
    const sculpture = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.95, 0.32, 200, 32, 2, 3),
      new THREE.MeshStandardMaterial({
        color: "#b8bec9",
        roughness: 0.27,
        metalness: 0.42,
      }),
    );
    sculpture.name = "Knot sculpture";
    sculpture.rotation.set(0.3, 0.2, 0);
    sculpture.position.y = 1.5;
    demo.add(sculpture);
    this.install(demo, [], "Studio sample", 0, true);
    this.ready = this.initialize();
    void this.ready.catch((error) => {
      if (!this.disposed)
        this.emit({
          error: `Renderer initialization failed: ${String(error)}`,
        });
    });
  }
  private async initialize() {
    await this.renderer.init();
    if (this.disposed) return;
    this.emit({
      rendererBackend:
        this.renderer.coordinateSystem === THREE.WebGPUCoordinateSystem
          ? "WebGPU"
          : "WebGL 2 fallback",
    });
    this.pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    try {
      this.environment = this.pmrem.fromScene(room).texture;
    } finally {
      room.dispose();
    }
    this.scene.environment =
      this.display.environment === "studio" ? this.environment : null;
    this.ktx.detectSupport(this.renderer);
    let last = performance.now(),
      frames = 0,
      fpsTime = 0,
      animationTime = 0,
      frameMs = 0,
      renderMs = 0;
    await this.renderer.setAnimationLoop((time) => {
      if (this.disposed) return;
      if (!this.element.clientWidth || !this.element.clientHeight) {
        last = time;
        return;
      }
      const elapsed = Math.max(0, (time - last) / 1000);
      const delta = Math.min(elapsed, 0.1);
      last = time;
      if (this.mixer && this.state.playing) {
        this.mixer.update(delta * this.speed);
        animationTime += delta;
        if (animationTime > 0.08) {
          this.emit({ time: this.action?.time || 0 });
          animationTime = 0;
        }
      }
      if (this.comparison && this.action)
        this.comparison.syncAnimation(
          this.clips[this.state.clipIndex]?.name || "",
          this.action.time,
        );
      if (!this.sceneCamera) this.controls.update();
      if (this.state.sceneHelpers) {
        this.model?.updateMatrixWorld(true);
        this.sceneHelperObjects.forEach((helper) => helper.update());
      }
      this.selection.update();
      if (this.display.normals !== "off" || this.display.bones)
        this.overlays.update(this.selection.object);
      this.modelCalls = 0;
      this.meshCalls.clear();
      const renderStart = performance.now();
      this.renderer.render(this.scene, this.renderCamera);
      renderMs += performance.now() - renderStart;
      frameMs += elapsed * 1000;
      frames++;
      fpsTime += elapsed;
      if (fpsTime >= 1) {
        this.emit({
          fps: Math.round(frames / fpsTime),
          drawCalls: this.renderer.info.render.drawCalls,
          modelDrawCalls: this.modelCalls,
          frameMs: frameMs / frames,
          renderMs: renderMs / frames,
          meshMetrics: this.state.meshMetrics.map((metric) => ({
            ...metric,
            drawCalls: this.meshCalls.get(metric.id) || 0,
          })),
        });
        frames = 0;
        fpsTime = 0;
        frameMs = 0;
        renderMs = 0;
      }
    });
  }
  private emit(update: Partial<ViewerState>) {
    this.state = { ...this.state, ...update };
    this.onChange(this.state);
  }
  private free(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        materials.add(material);
        for (const texture of materialTextures(material)) textures.add(texture);
      }
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh)
        (mesh as THREE.SkinnedMesh).skeleton.dispose();
    });
    geometries.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
  }
  private resizeSceneCamera() {
    const camera = this.sceneCamera;
    if (!camera) return;
    const aspect =
      this.element.clientWidth / Math.max(this.element.clientHeight, 1);
    if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
    else {
      const halfWidth = ((camera.top - camera.bottom) * aspect) / 2;
      const center = (camera.left + camera.right) / 2;
      camera.left = center - halfWidth;
      camera.right = center + halfWidth;
    }
    camera.updateProjectionMatrix();
  }
  selectSceneCamera(id: string) {
    const camera = id ? this.model?.getObjectByProperty("uuid", id) : undefined;
    if (
      id &&
      !(
        camera instanceof THREE.PerspectiveCamera ||
        camera instanceof THREE.OrthographicCamera
      )
    )
      return;
    this.sceneCamera = camera as
      THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined;
    this.controls.enabled = !this.sceneCamera;
    this.resizeSceneCamera();
    for (const helper of this.sceneHelperObjects)
      helper.visible = !(
        helper instanceof THREE.CameraHelper && helper.camera === camera
      );
    if (this.state.sceneCameraId !== id) this.emit({ sceneCameraId: id });
  }
  setSceneLights(enabled: boolean) {
    this.emit({ sceneLightsEnabled: enabled });
    this.setDisplay(this.display);
  }
  setSceneHelpers(visible: boolean) {
    this.sceneHelpers.visible = visible;
    this.emit({ sceneHelpers: visible });
  }
  private clearSceneHelpers() {
    this.sceneHelperObjects.forEach((helper) => helper.dispose());
    this.sceneHelperObjects = [];
    this.sceneHelpers.clear();
  }
  frame(object = this.selection.object || this.model) {
    this.selectSceneCamera("");
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3()),
      radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.01);
    const distance =
      (radius /
        Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) /
        Math.min(this.camera.aspect, 1)) *
      1.12;
    this.camera.position
      .copy(center)
      .add(
        new THREE.Vector3(1, 0.65, 1.3).normalize().multiplyScalar(distance),
      );
    this.camera.near = Math.max(radius / 1000, 0.00001);
    this.camera.far = distance + radius * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.maxDistance = radius * 100;
    this.controls.minDistance = radius * 0.01;
    this.controls.update();
  }
  selectObject(id: string) {
    const object = this.model?.getObjectByProperty("uuid", id);
    if (!object) return;
    if (
      (object as THREE.Bone).isBone &&
      this.display.inspection === "weights"
    ) {
      this.setDisplay({ ...this.display, weightBone: object.uuid });
      this.onDisplay?.(this.display);
    }
    this.selection.select(object, this.display.inspection === "material");
    this.emit({ selectedId: id, selectedName: object.name || object.type });
    this.frame(object);
  }
  clearSelection() {
    this.selection.clear();
    this.emit({ selectedId: null, selectedName: null });
  }
  private install(
    root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    name: string,
    size: number,
    demo = false,
    associations?: ReadonlyMap<
      THREE.Object3D | THREE.Material | THREE.Texture,
      { nodes?: number; meshes?: number }
    >,
    keepCamera = false,
  ) {
    this.selection.clear();
    this.overlays.clear();
    this.inspection.restore();
    this.clearMaterialPreviews();
    this.bridge?.dispose();
    this.bridge = undefined;
    this.isolatedVisibility.clear();
    this.materialsState.clear();
    if (this.mixer && this.model) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
    }
    if (this.model) {
      this.scene.remove(this.model);
      this.free(this.model);
    }
    this.model = root;
    this.sceneCamera = undefined;
    this.controls.enabled = true;
    this.clearSceneHelpers();
    const sceneCameras: ViewerState["sceneCameras"] = [],
      sceneLights: ViewerState["sceneLights"] = [];
    root.traverse((object) => {
      if (
        object instanceof THREE.PerspectiveCamera ||
        object instanceof THREE.OrthographicCamera
      ) {
        sceneCameras.push({ id: object.uuid, name: object.name || "Camera" });
        this.sceneHelperObjects.push(new THREE.CameraHelper(object));
      }
      if (object instanceof THREE.Light) {
        sceneLights.push({
          id: object.uuid,
          name: object.name || object.type,
          type: object.type,
        });
        if (object instanceof THREE.PointLight)
          this.sceneHelperObjects.push(
            new THREE.PointLightHelper(object, 0.15),
          );
        else if (object instanceof THREE.SpotLight)
          this.sceneHelperObjects.push(new THREE.SpotLightHelper(object));
        else if (object instanceof THREE.DirectionalLight)
          this.sceneHelperObjects.push(
            new THREE.DirectionalLightHelper(object, 0.5),
          );
      }
    });
    this.sceneHelperObjects.forEach((helper) => this.sceneHelpers.add(helper));
    this.sceneHelpers.visible = false;
    this.emit({
      sceneCameras,
      sceneLights,
      sceneCameraId: "",
      sceneLightsEnabled: true,
      sceneHelpers: false,
    });
    this.scene.add(root);
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(root);
    this.action = undefined;
    let triangles = 0,
      vertices = 0,
      meshes = 0,
      nodeCount = 0;
    const materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>(),
      nodes: SceneNode[] = [],
      metrics: MeshMetric[] = [],
      geometries = new Set<THREE.BufferGeometry>();
    root.traverse((object) => {
      nodeCount++;
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        geometries.add(mesh.geometry);
        const meshMaterials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        metrics.push({
          id: mesh.uuid,
          name: mesh.name || "Mesh",
          sourceIndex: associations?.get(mesh)?.nodes ?? null,
          triangles: Math.round(
            (mesh.geometry.index?.count ??
              mesh.geometry.attributes.position?.count ??
              0) / 3,
          ),
          vertices: mesh.geometry.attributes.position?.count || 0,
          materials: meshMaterials.map(
            (material) => material.name || material.type,
          ),
          drawCalls: 0,
          geometryBytes: geometryBytes(mesh.geometry),
          transparent: meshMaterials.some((material) => material.transparent),
          transmission: meshMaterials.some(
            (material) =>
              (material as THREE.MeshPhysicalMaterial).transmission > 0,
          ),
        });
        const before = mesh.onBeforeRender,
          after = mesh.onAfterRender;
        let start = 0;
        mesh.onBeforeRender = function (...args) {
          start = (args[0] as unknown as WebGPURenderer).info.render.drawCalls;
          before.apply(this, args);
        };
        const viewer = this;
        mesh.onAfterRender = function (...args) {
          const calls = Math.max(
            0,
            (args[0] as unknown as WebGPURenderer).info.render.drawCalls -
              start,
          );
          viewer.modelCalls += calls;
          viewer.meshCalls.set(
            mesh.uuid,
            (viewer.meshCalls.get(mesh.uuid) || 0) + calls,
          );
          after.apply(this, args);
        };
        meshes++;
        const count = (mesh as THREE.InstancedMesh).isInstancedMesh
          ? (mesh as THREE.InstancedMesh).count
          : 1;
        vertices += (mesh.geometry.attributes.position?.count || 0) * count;
        triangles +=
          ((mesh.geometry.index?.count ??
            mesh.geometry.attributes.position?.count ??
            0) /
            3) *
          count;
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          materials.add(material);
          for (const texture of materialTextures(material))
            textures.add(texture);
        }
      }
      {
        let depth = 0;
        for (
          let parent = object.parent;
          parent && parent !== this.scene;
          parent = parent.parent
        )
          depth++;
        nodes.push({
          id: object.uuid,
          name: object.name || object.type,
          depth,
          mesh: !!mesh.isMesh,
          bone: !!(object as THREE.Bone).isBone,
          sourceIndex: associations?.get(object)?.nodes ?? null,
        });
      }
    });
    const box = new THREE.Box3().setFromObject(root),
      dimensions = box.getSize(new THREE.Vector3()),
      gridSize = Math.max(...dimensions.toArray(), 0.01) * 3;
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.grid = new THREE.GridHelper(gridSize, 24, 0x303033, 0x18181b);
    this.grid.position.set(
      box.isEmpty() ? 0 : (box.min.x + box.max.x) / 2,
      box.isEmpty() ? 0 : box.min.y - gridSize * 0.002,
      box.isEmpty() ? 0 : (box.min.z + box.max.z) / 2,
    );
    this.scene.add(this.grid);
    this.setDisplay(this.display);
    const uploadedBuffers = new Set<object>();
    this.materialSources = new Map(
      [...materials].map((material) => [material.uuid, material]),
    );
    const materialSlots = [...materials].map((material) => {
      let graph: MaterialGraph;
      try {
        const raw = material.userData[BRIDGE_KEY];
        graph = parseMaterialGraph(raw);
      } catch {
        const standard = material as THREE.MeshStandardMaterial;
        graph = createMaterialGraph(material.name || "Material", {
          color: standard.color?.toArray(),
          roughness: standard.roughness ?? 0.5,
          metalness: standard.metalness ?? 0,
          alpha: material.opacity,
          transparent: material.transparent,
        });
      }
      graph = {
        ...graph,
        transparent: graph.transparent ?? material.transparent,
      };
      return {
        key: material.uuid,
        name: material.name || material.type,
        graph,
      };
    });
    this.emit({
      materialSlots,
      name,
      size,
      demo,
      loading: false,
      error: null,
      triangles: Math.round(triangles),
      vertices,
      meshes,
      materials: materials.size,
      textures: textures.size,
      dimensions:
        dimensions
          .toArray()
          .map((value) => value.toFixed(2))
          .join(" × ") + " m",
      nodes,
      nodeCount,
      selectedId: null,
      selectedName: null,
      drawCalls: 0,
      modelDrawCalls: 0,
      meshMetrics: metrics,
      textureBytes: textureMemory(textures),
      geometryBytes: [...geometries].reduce(
        (sum, geometry) => sum + geometryBytes(geometry, uploadedBuffers),
        0,
      ),
      isolatedId: null,
      clips: clips.map((clip, index) => ({
        name: clip.name || `Animation ${index + 1}`,
        duration: clip.duration,
      })),
      clipIndex: 0,
      playing: false,
      time: 0,
      duration: 0,
    });
    if (clips.length) this.selectAnimation(0);
    if (!keepCamera) this.frame();
  }
  private replaceMaterial(source: THREE.Material, target: THREE.Material) {
    this.model?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) =>
            material === source ? target : material,
          )
        : mesh.material === source
          ? target
          : mesh.material;
    });
  }
  private clearMaterialPreviews() {
    for (const [key, preview] of this.materialPreviews) {
      const original = this.materialSources.get(key);
      if (original) this.replaceMaterial(preview.material, original);
      preview.bridge.dispose();
      preview.source.dispose();
    }
    this.materialPreviews.clear();
    this.materialSources.clear();
    this.materialRequests.clear();
  }
  async previewMaterialGraph(key: string, graph: MaterialGraph) {
    compileMaterialGraph(graph);
    const original = this.materialSources.get(key);
    if (!original || this.disposed)
      throw new Error("The target material is no longer loaded.");
    const version = this.version,
      request = (this.materialRequests.get(key) || 0) + 1;
    this.materialRequests.set(key, request);
    const source = original.clone();
    source.userData[BRIDGE_KEY] = JSON.stringify(graph);
    const geometry = new THREE.BufferGeometry(),
      proxy = new THREE.Mesh(geometry, source);
    const bridge = await applyBridgeMaterials(proxy, {
      loadKTX2: (url) => this.ktx.loadAsync(url),
    });
    geometry.dispose();
    if (
      version !== this.version ||
      this.disposed ||
      this.materialRequests.get(key) !== request
    ) {
      bridge.dispose();
      source.dispose();
      return;
    }
    if (bridge.reports[0]?.status !== "translated") {
      bridge.dispose();
      source.dispose();
      throw new Error(
        bridge.reports[0]?.message || "Could not translate material.",
      );
    }
    this.selection.clear();
    this.inspection.restore();
    const previous = this.materialPreviews.get(key);
    if (previous) this.materialsState.delete(previous.material);
    this.replaceMaterial(previous?.material || original, proxy.material);
    previous?.bridge.dispose();
    previous?.source.dispose();
    this.materialPreviews.set(key, {
      material: proxy.material,
      source,
      bridge,
    });
    const changedMode = this.display.inspection !== "material";
    this.setDisplay({ ...this.display, inspection: "material" });
    if (changedMode) this.onDisplay?.(this.display);
    const reports = [
      ...(this.bridge?.reports || []),
      ...[...this.materialPreviews.values()].flatMap(
        (preview) => preview.bridge.reports,
      ),
    ];
    const activeMaterials = new Set<THREE.Material>(),
      activeTextures = new Set<THREE.Texture>();
    this.model?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        activeMaterials.add(material);
        for (const texture of materialTextures(material))
          activeTextures.add(texture);
      }
    });
    this.emit({
      materials: activeMaterials.size,
      textures: activeTextures.size,
      textureBytes: textureMemory(activeTextures),
      selectedId: null,
      selectedName: null,
      materialSlots: this.state.materialSlots.map((slot) =>
        slot.key === key ? { ...slot, graph } : slot,
      ),
      bridgeMaterials: reports.filter(
        (report, index) =>
          !reports.slice(index + 1).some((entry) => entry.id === report.id),
      ),
    });
  }
  async load(file: ModelFile, manager?: THREE.LoadingManager) {
    const version = ++this.version;
    let pendingBridge: BridgeMaterials | undefined;
    let pendingRoot: THREE.Object3D | undefined;
    this.emit({ loading: true, error: null });
    try {
      await this.ready;
      if (version !== this.version || this.disposed) return;
      if (!manager) {
        manager = new THREE.LoadingManager();
        const host = new URL(file.url).host;
        manager.setURLModifier((url) => {
          if (/^(data:|blob:)/.test(url)) return url;
          const resolved = new URL(url, location.href);
          if (resolved.protocol === "model:" && resolved.host === host)
            return url;
          if (
            resolved.origin === location.origin &&
            resolved.pathname.includes("/decoders/")
          )
            return url;
          throw new Error(
            "Model references a resource outside its local directory.",
          );
        });
      }
      const failures: string[] = [];
      manager.onError = (url) => failures.push(url);
      const started = performance.now();
      const response = await fetch(manager.resolveURL(file.url));
      if (!response.ok)
        throw new Error(`Could not read model (${response.status}).`);
      const data = await response.arrayBuffer();
      const readMs = performance.now() - started;
      const parseStart = performance.now();
      const gltf = await new GLTFLoader(manager)
        .setDRACOLoader(this.draco)
        .setKTX2Loader(this.ktx)
        .setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(data, file.url.slice(0, file.url.lastIndexOf("/") + 1));
      if (failures.length) {
        this.free(gltf.scene);
        throw new Error("Missing or unreadable resource: " + failures[0]);
      }
      if (version !== this.version || this.disposed) {
        this.free(gltf.scene);
        return;
      }
      pendingRoot = gltf.scene;
      pendingBridge = await applyBridgeMaterials(gltf.scene, {
        loadKTX2: (url) => this.ktx.loadAsync(url),
      });
      if (version !== this.version || this.disposed) {
        pendingBridge.dispose();
        this.free(gltf.scene);
        return;
      }
      const decodeMs = performance.now() - parseStart,
        compileStart = performance.now();
      await this.renderer.compileAsync(gltf.scene, this.camera, this.scene);
      if (version !== this.version || this.disposed) {
        pendingBridge.dispose();
        pendingBridge = undefined;
        this.free(gltf.scene);
        pendingRoot = undefined;
        return;
      }
      const compileMs = performance.now() - compileStart;
      this.install(
        gltf.scene,
        gltf.animations,
        file.name,
        file.size,
        false,
        gltf.parser.associations,
        file.reloaded,
      );
      this.bridge = pendingBridge;
      pendingBridge = undefined;
      pendingRoot = undefined;
      const firstStart = performance.now();
      this.renderer.render(this.scene, this.renderCamera);
      this.emit({
        optimized: !!file.optimized,
        sample: !!file.sample,
        bridgeMaterials: this.bridge.reports,
        timings: {
          readMs,
          decodeMs,
          compileMs,
          firstRenderMs: performance.now() - firstStart,
        },
      });
      this.onSource(file);
    } catch (error) {
      pendingBridge?.dispose();
      if (pendingRoot) this.free(pendingRoot);
      if (version !== this.version || this.disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ loading: false, error: message });
      throw error;
    }
  }
  setMaterialParameter(key: string, id: string, value: number) {
    if (!Number.isFinite(value)) return;
    this.bridge?.setParameter(key, id, value);
    for (const preview of this.materialPreviews.values())
      preview.bridge.setParameter(key, id, value);
    this.emit({
      bridgeMaterials: this.state.bridgeMaterials.map((report) =>
        report.key !== key
          ? report
          : {
              ...report,
              parameters: report.parameters.map((parameter) =>
                parameter.id === id ? { ...parameter, value } : parameter,
              ),
            },
      ),
    });
  }
  setDisplay(settings: DisplaySettings) {
    const selected = this.selection.object;
    this.selection.clear();
    this.inspection.restore();
    this.display = { ...settings };
    this.grid.visible = settings.grid;
    this.controls.autoRotate = settings.rotate;
    this.scene.background = new THREE.Color(settings.background);
    this.renderer.toneMappingExposure = settings.exposure;
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, settings.pixelRatio),
    );
    this.renderer.shadowMap.enabled = settings.shadows;
    this.key.castShadow = settings.shadows;
    this.key.shadow.mapSize.set(1024, 1024);
    const sceneLighting =
      this.state.sceneLightsEnabled && this.state.sceneLights.length > 0;
    this.scene.environment =
      !sceneLighting && settings.environment === "studio"
        ? (this.environment ?? null)
        : null;
    this.key.visible = !sceneLighting && settings.environment === "direct";
    this.ambient.intensity = sceneLighting
      ? 0
      : settings.environment === "neutral"
        ? 2.2
        : 0.6;
    this.model?.traverse((object) => {
      if (object instanceof THREE.Light) {
        object.visible = this.state.sceneLightsEnabled;
        object.castShadow = settings.shadows;
      }
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = settings.shadows;
        mesh.receiveShadow = settings.shadows;
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material])
          if ("wireframe" in material)
            (material as THREE.MeshStandardMaterial).wireframe =
              settings.wireframe;
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          const physical = material as THREE.MeshPhysicalMaterial;
          const nodes = material as unknown as MeshPhysicalNodeMaterial;
          if (!this.materialsState.has(material))
            this.materialsState.set(material, {
              transparent: material.transparent,
              transmission: physical.transmission,
              transmissionNode: nodes.transmissionNode,
            });
          const original = this.materialsState.get(material)!;
          if (original.transmissionNode) {
            const transmissionNode = settings.transmission
              ? original.transmissionNode
              : null;
            if (nodes.transmissionNode !== transmissionNode) {
              nodes.transmissionNode = transmissionNode;
              material.needsUpdate = true;
            }
          }
          const transparent = settings.transparency && original.transparent,
            transmission = settings.transmission ? original.transmission : 0;
          if (material.transparent !== transparent) {
            material.transparent = transparent;
            material.needsUpdate = true;
          }
          if (
            original.transmission !== undefined &&
            physical.transmission !== transmission
          ) {
            physical.transmission = transmission!;
            material.needsUpdate = true;
          }
        }
      }
    });
    if (this.model) this.inspection.apply(this.model, settings);
    if (selected)
      this.selection.select(selected, settings.inspection === "material");
    if (this.model) this.overlays.configure(this.model, settings);
  }
  selectAnimation(index: number) {
    this.mixer?.stopAllAction();
    const clip = this.clips[index];
    if (!clip || !this.mixer) return;
    this.action = this.mixer.clipAction(clip);
    this.action.play();
    this.emit({
      clipIndex: index,
      playing: true,
      time: 0,
      duration: clip.duration,
    });
  }
  focusSourceNode(index: number) {
    const row = this.state.nodes.find((node) => node.sourceIndex === index);
    if (row) this.selectObject(row.id);
  }
  isolate(id: string | null) {
    if (!this.model) return;
    this.clearSelection();
    for (const [object, visible] of this.isolatedVisibility)
      object.visible = visible;
    this.isolatedVisibility.clear();
    if (id) {
      const target = this.model.getObjectByProperty("uuid", id);
      if (!target) return;
      this.model.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          let within = false;
          for (
            let parent: THREE.Object3D | null = object;
            parent;
            parent = parent.parent
          )
            if (parent === target) within = true;
          this.isolatedVisibility.set(object, object.visible);
          object.visible = object.visible && within;
        }
      });
      this.frame(target);
    }
    this.emit({ isolatedId: id });
  }
  linkComparison(peer: ModelViewer) {
    this.comparison = peer;
    this.cameraLinked = peer;
    peer.cameraLinked = this;
    this.controls.dispatchEvent({ type: "change" });
  }
  private syncAnimation(name: string, time: number) {
    const index = this.clips.findIndex((clip) => clip.name === name);
    if (index < 0) return;
    if (this.state.clipIndex !== index || !this.action)
      this.selectAnimation(index);
    this.action!.time = time;
    this.mixer?.update(0);
    if (this.state.playing) this.emit({ playing: false });
  }
  getUV(set: number) {
    return this.model
      ? this.inspection.uv(this.model, this.selection.object, set)
      : null;
  }
  togglePlayback() {
    if (this.action) this.emit({ playing: !this.state.playing });
  }
  seek(time: number) {
    if (!this.action || !this.mixer) return;
    this.action.time = time;
    this.mixer.update(0);
    this.emit({ time });
  }
  setSpeed(speed: number) {
    this.speed = speed;
  }
  async screenshot() {
    await this.ready;
    if (this.disposed) return;
    this.renderer.render(this.scene, this.renderCamera);
    const link = document.createElement("a");
    link.download =
      this.state.name.replace(/\.(glb|gltf)$/i, "") + "-preview.png";
    link.href = this.renderer.domElement.toDataURL("image/png");
    link.click();
  }
  dispose() {
    this.disposed = true;
    this.overlays.dispose();
    this.clearSceneHelpers();
    this.inspection.restore();
    this.version++;
    this.clearMaterialPreviews();
    this.bridge?.dispose();
    void this.ready
      .then(() => this.renderer.setAnimationLoop(null))
      .catch(() => {});
    this.selection.clear();
    this.observer.disconnect();
    this.controls.dispose();
    this.draco.dispose();
    this.ktx.dispose();
    if (this.model) this.free(this.model);
    this.environment?.dispose();
    this.pmrem?.dispose();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    void this.ready
      .then(() => this.renderer.dispose())
      .catch(() => this.renderer.dispose());
    this.renderer.domElement.remove();
  }
}
