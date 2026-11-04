import * as THREE from "three";
import type { MeshPhysicalNodeMaterial, Node } from "three/webgpu";
import { color, vec3 } from "three/tsl";
/** Temporary viewport styling; source materials are restored before export/load. */
export class ObjectSelection {
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private clones: THREE.Material[] = [];
  private helper?: THREE.Box3Helper;
  object?: THREE.Object3D;
  constructor(private scene: THREE.Scene) {}
  select(object: THREE.Object3D, tint = true) {
    this.clear();
    this.object = object;
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !tint) return;
      this.originals.set(mesh, mesh.material);
      const highlight = (material: THREE.Material) => {
        const copy = material.clone() as THREE.MeshStandardMaterial;
        this.clones.push(copy);
        if (copy.emissive) {
          copy.emissive.set("#6b9cff");
          copy.emissiveIntensity = 0.35;
          const nodes = copy as unknown as MeshPhysicalNodeMaterial;
          if (nodes.emissiveNode)
            nodes.emissiveNode = vec3(nodes.emissiveNode as Node<"vec3">).add(
              color("#6b9cff").mul(0.35),
            );
        } else if (copy.color) copy.color.lerp(new THREE.Color("#6b9cff"), 0.3);
        return copy;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(highlight)
        : highlight(mesh.material);
    });
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      this.helper = new THREE.Box3Helper(box, new THREE.Color("#8ab4ff"));
      this.helper.name = "Selection bounds";
      for (const material of Array.isArray(this.helper.material)
        ? this.helper.material
        : [this.helper.material])
        material.depthTest = false;
      this.helper.renderOrder = 1000;
      this.scene.add(this.helper);
    }
  }
  update() {
    if (this.object && this.helper) this.helper.box.setFromObject(this.object);
  }
  clear() {
    for (const [mesh, material] of this.originals) mesh.material = material;
    this.originals.clear();
    this.clones.forEach((material) => material.dispose());
    this.clones = [];
    if (this.helper) {
      this.scene.remove(this.helper);
      this.helper.dispose();
      this.helper = undefined;
    }
    this.object = undefined;
  }
}
