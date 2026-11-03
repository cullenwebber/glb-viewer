import assert from "node:assert/strict";
import * as THREE from "three";
import { InspectionOverlays } from "../src/viewer/inspection-overlays.ts";
import { defaultDisplay } from "../src/viewer/types.ts";
const root = new THREE.Group(),
  geometry = new THREE.BufferGeometry();
geometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
);
geometry.setAttribute(
  "normal",
  new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
);
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
root.add(mesh);
const overlay = new InspectionOverlays();
const lines = () =>
  overlay.group.children.find(
    (object) => object.isLineSegments && !object.isSkeletonHelper,
  );
const positions = () => lines().geometry.attributes.position;
overlay.configure(root, {
  ...defaultDisplay,
  normals: "vertex",
  normalLength: 10,
});
assert.equal(positions().count, 6);
assert(Math.abs(positions().getZ(1) - 0.1) < 1e-6);
overlay.configure(root, {
  ...defaultDisplay,
  normals: "face",
  normalLength: 10,
});
assert.equal(positions().count, 2);
assert(Math.abs(positions().getX(0) - 1 / 3) < 1e-6);
assert(Math.abs(positions().getZ(1) - 0.1) < 1e-6);
mesh.visible = false;
overlay.update();
assert.equal(lines().geometry.drawRange.count, 0);
mesh.visible = true;
const other = new THREE.Group();
root.add(other);
overlay.configure(root, {
  ...defaultDisplay,
  normals: "vertex",
  normalsSelectedOnly: true,
});
overlay.update(other);
assert.equal(lines().geometry.drawRange.count, 0);
overlay.update(mesh);
assert.equal(lines().geometry.drawRange.count, 6);
// Morph normals and positions update without rebuilding the overlay.
geometry.morphTargetsRelative = true;
geometry.morphAttributes.position = [
  new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
];
geometry.morphAttributes.normal = [
  new THREE.Float32BufferAttribute([0, 1, -1, 0, 1, -1, 0, 1, -1], 3),
];
mesh.updateMorphTargets();
mesh.morphTargetInfluences[0] = 1;
overlay.configure(root, {
  ...defaultDisplay,
  normals: "vertex",
  normalLength: 10,
});
assert.equal(positions().getZ(0), 1);
assert(positions().getY(1) > 0.09);
// A skin with two bones: posed vertices, normals, and skeleton connections follow the pose.
root.remove(mesh);
const skinGeometry = geometry.clone();
skinGeometry.morphAttributes = {};
skinGeometry.setAttribute(
  "skinIndex",
  new THREE.Uint16BufferAttribute(new Array(3).fill([0, 0, 0, 0]).flat(), 4),
);
skinGeometry.setAttribute(
  "skinWeight",
  new THREE.Float32BufferAttribute(new Array(3).fill([1, 0, 0, 0]).flat(), 4),
);
const skin = new THREE.SkinnedMesh(skinGeometry, new THREE.MeshBasicMaterial());
const bone = new THREE.Bone(),
  tip = new THREE.Bone();
tip.position.y = 1;
bone.add(tip);
skin.add(bone);
root.add(skin);
skin.bind(new THREE.Skeleton([bone, tip]));
overlay.configure(root, {
  ...defaultDisplay,
  normals: "vertex",
  bones: true,
  normalLength: 10,
});
assert(overlay.group.children.some((object) => object.isSkeletonHelper));
bone.rotation.x = Math.PI / 2;
overlay.update();
assert(positions().getY(1) < -0.09, "normal follows animated bone rotation");
assert(
  Math.abs(positions().getZ(4) - 1) < 1e-6,
  "vertex follows bone rotation",
);
const helper = overlay.group.children.find((object) => object.isSkeletonHelper);
helper.updateMatrixWorld(true);
assert.equal(helper.geometry.attributes.position.count, 2);
overlay.configure(root, {
  ...defaultDisplay,
  normals: "vertex",
  overlayInFront: false,
});
assert.equal(lines().material.depthTest, true);
overlay.clear();
assert.equal(overlay.group.children.length, 0);
root.remove(skin);
const dense = new THREE.Mesh(
  new THREE.SphereGeometry(1, 128, 128),
  new THREE.MeshBasicMaterial(),
);
root.add(dense);
overlay.configure(root, { ...defaultDisplay, normals: "vertex" });
assert(positions().count <= 10000);
overlay.dispose();
console.log(
  "PASS: vertex/face normal direction, morphs, animated skinning, skeleton lines, visibility/selection filtering, depth mode, sampling limit, and disposal.",
);
