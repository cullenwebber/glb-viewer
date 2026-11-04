import * as THREE from "three";
import {
  MeshBasicNodeMaterial,
  type MeshPhysicalNodeMaterial,
  type Node,
} from "three/webgpu";
import {
  attribute,
  float,
  frontFacing,
  mix,
  texture,
  varying,
  vec3,
} from "three/tsl";
import { textureMemory, materialTextures } from "./performance.ts";
import type { DisplaySettings } from "./types";
export type UVSnapshot = {
  name: string;
  sets: number[];
  segments: number[];
  truncated: boolean;
  image: CanvasImageSource | null;
};
export class MaterialInspection {
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private temporary: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  restore() {
    for (const [mesh, material] of this.originals) mesh.material = material;
    this.originals.clear();
    this.temporary.forEach((m) => m.dispose());
    this.temporary = [];
    this.textures.forEach((t) => t.dispose());
    this.textures = [];
  }
  apply(root: THREE.Object3D, settings: DisplaySettings) {
    this.restore();
    if (settings.inspection === "material") return;
    const meshes: THREE.Mesh[] = [];
    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });
    const cost = (mesh: THREE.Mesh) => {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      if (settings.costMetric === "materials") return materials.length;
      if (settings.costMetric === "textures") {
        const textures = new Set<THREE.Texture>();
        for (const material of materials)
          for (const texture of materialTextures(material))
            textures.add(texture);
        return textureMemory(textures);
      }
      return (
        ((mesh.geometry.index?.count ??
          mesh.geometry.attributes.position?.count ??
          0) /
          3) *
        ((mesh as THREE.InstancedMesh).count || 1)
      );
    };
    const maximum = meshes.reduce(
      (maximum, mesh) => Math.max(maximum, cost(mesh)),
      1,
    );
    for (const mesh of meshes) {
      const original = mesh.material;
      this.originals.set(mesh, original);
      const make = (source: THREE.Material) => {
        const p = source as THREE.MeshStandardMaterial;
        const nodes = source as MeshPhysicalNodeMaterial;
        let material: THREE.Material;
        if (settings.inspection === "normals")
          material = new THREE.MeshNormalMaterial({
            side: source.side,
            wireframe: settings.wireframe,
          });
        else {
          const basic = new MeshBasicNodeMaterial({
            side:
              settings.inspection === "orientation"
                ? THREE.DoubleSide
                : source.side,
            wireframe: settings.wireframe,
          });
          const mode = settings.inspection;
          if (mode === "baseColor") {
            basic.map = p.map;
            basic.color.copy(p.color || new THREE.Color(1, 1, 1));
            if (nodes.colorNode) basic.colorNode = nodes.colorNode;
          }
          if (mode === "normalMap") {
            if (p.normalMap) {
              const map = p.normalMap.clone();
              map.colorSpace = THREE.SRGBColorSpace;
              map.needsUpdate = true;
              this.textures.push(map);
              basic.map = map;
            } else basic.color.setRGB(0.5, 0.5, 1, THREE.SRGBColorSpace);
          }
          if (mode === "checker") {
            const data = new Uint8Array([
              230, 230, 230, 255, 55, 55, 55, 255, 55, 55, 55, 255, 230, 230,
              230, 255,
            ]);
            const checker = new THREE.DataTexture(data, 2, 2);
            checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
            checker.repeat.set(12, 12);
            checker.magFilter = THREE.NearestFilter;
            checker.channel = settings.uvSet;
            checker.needsUpdate = true;
            this.textures.push(checker);
            basic.map = checker;
            if (
              !mesh.geometry.getAttribute(
                settings.uvSet === 0 ? "uv" : `uv${settings.uvSet}`,
              )
            )
              basic.color.set("#e27c68");
          }
          if (mode === "cost")
            basic.color.setHSL(
              (1 - Math.log1p(cost(mesh)) / Math.log1p(maximum)) * 0.62,
              0.85,
              0.5,
            );
          if (["roughness", "metalness", "ao", "alpha"].includes(mode)) {
            const maps = {
              roughness: p.roughnessMap,
              metalness: p.metalnessMap,
              ao: p.aoMap,
              alpha: p.alphaMap || p.map,
            };
            const factors = {
              roughness: p.roughness ?? 1,
              metalness: p.metalness ?? 0,
              ao: 1,
              alpha: p.opacity,
            };
            const channels = {
              roughness: "g",
              metalness: "b",
              ao: "r",
              alpha: p.alphaMap ? "g" : "a",
            } as const;
            const key = mode as keyof typeof maps;
            const map = maps[key];
            basic.colorNode = vec3(
              (map ? texture(map)[channels[key]] : float(1)).mul(factors[key]),
            );
            const channelNode = {
              roughness: nodes.roughnessNode,
              metalness: nodes.metalnessNode,
              alpha: nodes.opacityNode,
              ao: null,
            }[key];
            if (channelNode)
              basic.colorNode = vec3(channelNode as Node<"float">);
          }
          if (mode === "orientation")
            basic.colorNode = frontFacing.select(
              vec3(0.12, 0.32, 0.95),
              vec3(0.95, 0.12, 0.08),
            );
          if (mode === "weights") {
            const skin = mesh as THREE.SkinnedMesh;
            const index = skin.isSkinnedMesh
              ? skin.skeleton.bones.findIndex(
                  (bone) => bone.uuid === settings.weightBone,
                )
              : -1;
            let weight = float(0).add(0);
            if (index >= 0) {
              const indices = attribute("skinIndex", "vec4"),
                weights = attribute("skinWeight", "vec4");
              for (const channel of ["x", "y", "z", "w"] as const)
                weight = weight.add(
                  indices[channel]
                    .equal(index)
                    .select(weights[channel], float(0)),
                );
            }
            basic.colorNode = mix(
              vec3(0.04, 0.1, 0.7),
              vec3(1, 0.05, 0),
              varying(weight).clamp(0, 1),
            );
          }
          material = basic;
        }
        this.temporary.push(material);
        return material;
      };
      mesh.material = Array.isArray(original)
        ? original.map(make)
        : make(original);
    }
  }
  uv(
    root: THREE.Object3D,
    selected: THREE.Object3D | undefined,
    set: number,
  ): UVSnapshot {
    let mesh: THREE.Mesh | undefined;
    (selected || root).traverse((object) => {
      if (!mesh && (object as THREE.Mesh).isMesh) mesh = object as THREE.Mesh;
    });
    if (!mesh)
      return {
        name: "No mesh selected",
        sets: [],
        segments: [],
        truncated: false,
        image: null,
      };
    const geometry = mesh.geometry,
      sets = [0, 1, 2, 3].filter((i) =>
        geometry.hasAttribute(i === 0 ? "uv" : `uv${i}`),
      );
    const uv = geometry.getAttribute(set === 0 ? "uv" : `uv${set}`),
      segments: number[] = [];
    const count =
      geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    const step = Math.max(1, Math.ceil(count / 3 / 50000));
    if (uv)
      for (let i = 0; i + 2 < count; i += 3 * step) {
        const ids = [0, 1, 2].map((j) =>
          geometry.index ? geometry.index.getX(i + j) : i + j,
        );
        for (let j = 0; j < 3; j++)
          segments.push(
            uv.getX(ids[j]),
            uv.getY(ids[j]),
            uv.getX(ids[(j + 1) % 3]),
            uv.getY(ids[(j + 1) % 3]),
          );
      }
    const original = this.originals.get(mesh) || mesh.material;
    const material = (
      Array.isArray(original) ? original[0] : original
    ) as THREE.MeshStandardMaterial;
    const image = material.map?.image;
    return {
      name: mesh.name || "Mesh",
      sets,
      segments,
      truncated: step > 1,
      image:
        image && !(material.map as THREE.CompressedTexture)?.isCompressedTexture
          ? (image as CanvasImageSource)
          : null,
    };
  }
}
