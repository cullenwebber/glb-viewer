import { MaterialInspection } from "./material-inspection";
import { InspectionOverlays } from "./inspection-overlays";
import * as THREE from "three";
import { geometryBytes, textureMemory, type MeshMetric } from "./performance";
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
  readonly renderer: THREE.WebGLRenderer;
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
    { transparent: boolean; transmission: number | undefined }
  >();
  private isolatedVisibility = new Map<THREE.Object3D, boolean>();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  private controls: OrbitControls;
  private environment: THREE.Texture;
  private pmrem: THREE.PMREMGenerator;
  private ambient = new THREE.HemisphereLight(0xffffff, 0x555b68, 0.6);
  private key = new THREE.DirectionalLight(0xffffff, 3);
  private grid = new THREE.GridHelper(12, 24, 0x303033, 0x18181b);
  private model?: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;
  private action?: THREE.AnimationAction;
  private clips: THREE.AnimationClip[] = [];
  private observer: ResizeObserver;
  private draco = new DRACOLoader().setDecoderPath("./decoders/draco/");
  private ktx: KTX2Loader;
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
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
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
        point.setFromMatrixPosition(object.matrixWorld).project(this.camera);
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
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = this.pmrem.fromScene(room).texture;
    room.dispose();
    this.scene.environment = this.environment;
    this.scene.background = new THREE.Color(this.display.background);
    this.scene.add(this.ambient, this.key, this.grid, this.overlays.group);
    this.key.position.set(3, 5, 4);
    this.key.visible = false;
    this.ktx = new KTX2Loader()
      .setTranscoderPath("./decoders/basis/")
      .detectSupport(this.renderer);
    useBundledWorker(this.ktx, "init", "basis-worker.js");
    useBundledWorker(this.draco, "_initDecoder", "draco-worker.js");
    this.observer = new ResizeObserver(() => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (!width || !height) return;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
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
    let last = performance.now(),
      frames = 0,
      fpsTime = 0,
      animationTime = 0,
      frameMs = 0,
      renderMs = 0;
    this.renderer.setAnimationLoop((time) => {
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
      this.controls.update();
      this.selection.update();
      if (this.display.normals !== "off" || this.display.bones)
        this.overlays.update(this.selection.object);
      this.modelCalls = 0;
      this.meshCalls.clear();
      const renderStart = performance.now();
      this.renderer.render(this.scene, this.camera);
      renderMs += performance.now() - renderStart;
      frameMs += elapsed * 1000;
      frames++;
      fpsTime += elapsed;
      if (fpsTime >= 1) {
        this.emit({
          fps: Math.round(frames / fpsTime),
          drawCalls: this.renderer.info.render.calls,
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
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh)
        (mesh as THREE.SkinnedMesh).skeleton.dispose();
    });
    geometries.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
  }
  frame(object = this.selection.object || this.model) {
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
          start = args[0].info.render.calls;
          before.apply(this, args);
        };
        const viewer = this;
        mesh.onAfterRender = function (...args) {
          const calls = Math.max(0, args[0].info.render.calls - start);
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
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) textures.add(value);
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
    this.emit({
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
  async load(file: ModelFile, manager?: THREE.LoadingManager) {
    const version = ++this.version;
    this.emit({ loading: true, error: null });
    try {
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
      const decodeMs = performance.now() - parseStart,
        compileStart = performance.now();
      await this.renderer.compileAsync(gltf.scene, this.camera, this.scene);
      if (version !== this.version || this.disposed) {
        this.free(gltf.scene);
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
      const firstStart = performance.now();
      this.renderer.render(this.scene, this.camera);
      this.emit({
        optimized: !!file.optimized,
        timings: {
          readMs,
          decodeMs,
          compileMs,
          firstRenderMs: performance.now() - firstStart,
        },
      });
      this.onSource(file);
    } catch (error) {
      if (version !== this.version || this.disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ loading: false, error: message });
      throw error;
    }
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
    this.scene.environment =
      settings.environment === "studio" ? this.environment : null;
    this.key.visible = settings.environment === "direct";
    this.ambient.intensity = settings.environment === "neutral" ? 2.2 : 0.6;
    this.model?.traverse((object) => {
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
          if (!this.materialsState.has(material))
            this.materialsState.set(material, {
              transparent: material.transparent,
              transmission: physical.transmission,
            });
          const original = this.materialsState.get(material)!;
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
  screenshot() {
    this.renderer.render(this.scene, this.camera);
    const link = document.createElement("a");
    link.download =
      this.state.name.replace(/\.(glb|gltf)$/i, "") + "-preview.png";
    link.href = this.renderer.domElement.toDataURL("image/png");
    link.click();
  }
  dispose() {
    this.disposed = true;
    this.overlays.dispose();
    this.inspection.restore();
    this.version++;
    this.renderer.setAnimationLoop(null);
    this.selection.clear();
    this.observer.disconnect();
    this.controls.dispose();
    this.draco.dispose();
    this.ktx.dispose();
    if (this.model) this.free(this.model);
    this.environment.dispose();
    this.pmrem.dispose();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
