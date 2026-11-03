import * as THREE from "three";
import type { DisplaySettings } from "./types";

const LIMIT = 5000;
type Sample = { mesh: THREE.Mesh; index: number; instance: number };
/** View-only helpers, kept outside the asset so they never enter exports or model statistics. */
export class InspectionOverlays {
  readonly group = new THREE.Group();
  private lines?: THREE.LineSegments;
  private skeleton?: THREE.SkeletonHelper;
  private joints?: THREE.Points;
  private samples: Sample[] = [];
  private settings?: DisplaySettings;
  private root?: THREE.Object3D;
  private length = 0.05;
  configure(root: THREE.Object3D, settings: DisplaySettings) {
    this.clear();
    this.root = root;
    this.settings = settings;
    root.updateMatrixWorld(true);
    const size = new THREE.Box3()
      .setFromObject(root)
      .getSize(new THREE.Vector3());
    this.length =
      (Math.max(size.x, size.y, size.z, 0.01) * settings.normalLength) / 100;
    if (settings.bones) {
      this.skeleton = new THREE.SkeletonHelper(root);
      const material = this.skeleton.material as THREE.LineBasicMaterial;
      material.depthTest = !settings.overlayInFront;
      material.depthWrite = false;
      this.skeleton.renderOrder = 1000;
      this.group.add(this.skeleton);
      const jointsGeometry = new THREE.BufferGeometry();
      jointsGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array(this.skeleton.bones.length * 3),
          3,
        ).setUsage(THREE.DynamicDrawUsage),
      );
      this.joints = new THREE.Points(
        jointsGeometry,
        new THREE.PointsMaterial({
          color: 0x80e0c0,
          size: 5,
          sizeAttenuation: false,
          depthTest: !settings.overlayInFront,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      this.joints.frustumCulled = false;
      this.joints.renderOrder = 1001;
      this.group.add(this.joints);
    }
    if (settings.normals === "off") {
      this.update();
      return;
    }
    let total = 0;
    const meshes: { mesh: THREE.Mesh; count: number; instances: number }[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry.attributes.position) return;
      // Line/point topologies have no triangle face normals.
      const count =
        settings.normals === "face"
          ? Math.floor(
              (mesh.geometry.index?.count ??
                mesh.geometry.attributes.position.count) / 3,
            )
          : mesh.geometry.attributes.normal
            ? mesh.geometry.attributes.position.count
            : 0;
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh
        ? (mesh as THREE.InstancedMesh).count
        : 1;
      meshes.push({ mesh, count, instances });
      total += count * instances;
    });
    const step = Math.max(1, Math.ceil(total / LIMIT));
    let offset = 0;
    for (const { mesh, count, instances } of meshes) {
      const end = offset + count * instances;
      for (
        let cursor = Math.ceil(offset / step) * step;
        cursor < end;
        cursor += step
      ) {
        const local = cursor - offset;
        this.samples.push({
          mesh,
          index: local % count,
          instance: Math.floor(local / count),
        });
      }
      offset = end;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(this.samples.length * 6),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    this.lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: settings.normals === "face" ? 0xffb454 : 0x52c7ff,
        depthTest: !settings.overlayInFront,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1000;
    this.group.add(this.lines);
    this.update();
  }
  update(selection?: THREE.Object3D | null) {
    if (!this.root || !this.settings) return;
    this.root.updateMatrixWorld(true);
    this.root.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) mesh.skeleton.update();
    });
    if (this.joints && this.skeleton) {
      const position = this.joints.geometry.attributes
        .position as THREE.BufferAttribute;
      const point = new THREE.Vector3();
      this.skeleton.bones.forEach((bone, index) => {
        point.setFromMatrixPosition(bone.matrixWorld);
        position.setXYZ(index, point.x, point.y, point.z);
      });
      position.needsUpdate = true;
    }
    if (!this.lines) return;
    const array = this.lines.geometry.attributes
      .position as THREE.BufferAttribute;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      n = new THREE.Vector3();
    const base = new THREE.Vector3(),
      morphed = new THREE.Vector3(),
      temp = new THREE.Vector3();
    const matrix = new THREE.Matrix4(),
      instanceMatrix = new THREE.Matrix4(),
      normalMatrix = new THREE.Matrix3();
    let output = 0;
    for (const sample of this.samples) {
      const { mesh, index, instance } = sample;
      let visible = true,
        inSelection = !selection;
      for (
        let parent: THREE.Object3D | null = mesh;
        parent;
        parent = parent.parent
      ) {
        if (!parent.visible) visible = false;
        if (parent === selection) inSelection = true;
      }
      if (!visible || (this.settings.normalsSelectedOnly && !inSelection))
        continue;
      matrix.copy(mesh.matrixWorld);
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        (mesh as THREE.InstancedMesh).getMatrixAt(instance, instanceMatrix);
        matrix.multiply(instanceMatrix);
      }
      const geometry = mesh.geometry;
      if (this.settings.normals === "face") {
        const vertex = (i: number, target: THREE.Vector3) =>
          mesh
            .getVertexPosition(
              geometry.index ? geometry.index.getX(i) : i,
              target,
            )
            .applyMatrix4(matrix);
        vertex(index * 3, a);
        vertex(index * 3 + 1, b);
        vertex(index * 3 + 2, c);
        n.subVectors(c, b).cross(temp.subVectors(a, b)).normalize();
        a.add(b).add(c).divideScalar(3);
      } else {
        mesh.getVertexPosition(index, a).applyMatrix4(matrix);
        n.fromBufferAttribute(geometry.attributes.normal, index);
        base.fromBufferAttribute(geometry.attributes.position, index);
        morphed.copy(base);
        for (const [i, influence] of (
          mesh.morphTargetInfluences || []
        ).entries()) {
          if (!influence) continue;
          const position = geometry.morphAttributes.position?.[i];
          if (position) {
            temp.fromBufferAttribute(position, index);
            if (!geometry.morphTargetsRelative) temp.sub(base);
            morphed.addScaledVector(temp, influence);
          }
          const normal = geometry.morphAttributes.normal?.[i];
          if (normal) {
            temp.fromBufferAttribute(normal, index);
            if (!geometry.morphTargetsRelative)
              temp.sub(
                base.fromBufferAttribute(geometry.attributes.normal, index),
              );
            n.addScaledVector(temp, influence);
            base.fromBufferAttribute(geometry.attributes.position, index);
          }
        }
        const skin = mesh as THREE.SkinnedMesh;
        if (skin.isSkinnedMesh) {
          temp.copy(morphed).add(n);
          skin.applyBoneTransform(index, temp);
          skin.applyBoneTransform(index, morphed);
          n.subVectors(temp, morphed);
        }
        n.applyMatrix3(normalMatrix.getNormalMatrix(matrix)).normalize();
      }
      if (![a.x, a.y, a.z, n.x, n.y, n.z].every(Number.isFinite)) continue;
      array.setXYZ(output++, a.x, a.y, a.z);
      a.addScaledVector(n, this.length);
      array.setXYZ(output++, a.x, a.y, a.z);
    }
    array.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, output);
  }
  clear() {
    if (this.lines) {
      this.lines.geometry.dispose();
      (this.lines.material as THREE.Material).dispose();
    }
    this.skeleton?.dispose();
    if (this.joints) {
      this.joints.geometry.dispose();
      (this.joints.material as THREE.Material).dispose();
    }
    this.joints = undefined;
    this.group.clear();
    this.lines = undefined;
    this.skeleton = undefined;
    this.samples = [];
    this.root = undefined;
  }
  dispose() {
    this.clear();
    this.group.removeFromParent();
  }
}
