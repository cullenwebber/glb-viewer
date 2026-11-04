import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import * as THREE from "three";
import { sourceMaterialGraph } from "../src/lib/source-material-graph.ts";
import { parseMaterialGraph } from "../src/lib/material-editor.ts";
import { materialTextures } from "../src/viewer/performance.ts";
import {
  BRIDGE_KEY,
  compileMaterialGraph,
  materialModule,
} from "../electron/pipeline/material-graph.mjs";
import { applyBridgeMaterials } from "../electron/pipeline/material-runtime.mjs";

const source = new THREE.MeshPhysicalMaterial({
  name: "Textured paint",
  color: 0x887766,
  metalness: 0.7,
  roughness: 0.4,
  opacity: 0.8,
  transparent: true,
  alphaTest: 0.25,
  side: THREE.DoubleSide,
  vertexColors: true,
});
const albedo = new THREE.Texture({ width: 2048, height: 1024 });
albedo.name = "paint.png";
albedo.colorSpace = THREE.SRGBColorSpace;
albedo.flipY = false;
albedo.channel = 1;
albedo.offset.set(0.1, 0.2);
albedo.repeat.set(2, 3);
albedo.rotation = 0.3;
albedo.wrapS = THREE.MirroredRepeatWrapping;
albedo.updateMatrix();
const orm = new THREE.Texture({ width: 512, height: 512 });
orm.name = "packed ORM";
const normal = new THREE.Texture({ width: 512, height: 512 });
source.map = albedo;
source.roughnessMap = source.metalnessMap = source.aoMap = orm;
source.aoMapIntensity = 0.6;
source.normalMap = normal;
source.normalScale.set(0.7, -0.4);
source.emissiveMap = albedo;
source.emissive.setRGB(0.2, 0.3, 0.4);
const graph = sourceMaterialGraph(source);
assert.deepEqual(parseMaterialGraph(JSON.stringify(graph)), graph);
assert.equal(graph.nodes.filter((node) => node.type === "image").length, 3);
assert.equal(
  graph.nodes.filter((node) => node.type === "separateColor").length,
  1,
);
const image = graph.nodes.find((node) => node.sourceTexture === albedo.uuid);
assert.deepEqual(image.imageSize, [2048, 1024]);
assert.equal(image.uvChannel, 1);
assert.equal(image.image, undefined);
assert.equal(image.extension, "source");
const plan = compileMaterialGraph(graph);
for (const channel of ["red", "green", "blue"])
  assert(plan.steps.some((step) => step.op === `channel_${channel}`));
for (const output of [
  "color",
  "alpha",
  "roughness",
  "metalness",
  "emission",
  "ao",
  "normal",
])
  assert(plan.outputs[output]);
assert.deepEqual(
  graph.nodes.find((node) => node.type === "normalMap").inputs.scale.value,
  [0.7, -0.4, 1],
);
const textures = new Map(
  [albedo, orm, normal].map((texture) => [texture.uuid, texture]),
);
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source);
source.userData[BRIDGE_KEY] = JSON.stringify(graph);
let originalDisposals = 0;
for (const texture of textures.values())
  texture.addEventListener("dispose", () => originalDisposals++);
const bridge = await applyBridgeMaterials(mesh, {
  resolveTexture: (reference) => textures.get(reference),
});
assert.equal(bridge.reports[0].status, "translated", bridge.reports[0].message);
assert.equal(mesh.material.side, THREE.DoubleSide);
assert.equal(mesh.material.alphaTest, 0.25);
assert.equal(mesh.material.vertexColors, true);
const previewTexture = [...materialTextures(mesh.material)].find(
  (texture) => texture.source === albedo.source,
);
assert(previewTexture);
assert.notEqual(previewTexture, albedo);
assert.equal(previewTexture.channel, 1);
assert.equal(previewTexture.wrapS, THREE.MirroredRepeatWrapping);
assert.deepEqual(previewTexture.matrix.elements, albedo.matrix.elements);
bridge.dispose();
assert.equal(mesh.material, source);
assert.equal(originalDisposals, 0);
const missing = await applyBridgeMaterials(mesh);
assert.equal(missing.reports[0].status, "fallback");
assert.match(missing.reports[0].message, /resolveTexture/);
missing.dispose();
const unsupported = source.clone();
unsupported.bumpMap = new THREE.Texture({ width: 32, height: 32 });
assert(
  sourceMaterialGraph(unsupported).warnings.some((warning) =>
    warning.includes("bumpMap"),
  ),
);
const directory = path.resolve(".source-material-test-" + Date.now());
await mkdir(directory);
try {
  const file = path.join(directory, "material.ts");
  await writeFile(file, materialModule(graph));
  execFileSync(
    path.resolve("node_modules/.bin/tsc"),
    [
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--module",
      "ESNext",
      "--target",
      "ES2022",
      "--moduleResolution",
      "Bundler",
      file,
    ],
    { stdio: "pipe" },
  );
  const { createMaterial } = await import(pathToFileURL(file).href);
  await assert.rejects(createMaterial(), /resolveTexture/);
  const asset = await createMaterial({
    resolveTexture: (reference) => textures.get(reference),
  });
  assert.equal(asset.material.alphaTest, 0.25);
  assert.equal(asset.material.side, THREE.DoubleSide);
  assert(asset.material.aoNode);
  asset.dispose();
  assert.equal(originalDisposals, 0);
} finally {
  await rm(directory, { recursive: true, force: true });
  mesh.geometry.dispose();
  source.dispose();
  unsupported.dispose();
  unsupported.bumpMap.dispose();
  for (const texture of textures.values()) texture.dispose();
}
console.log(
  "PASS: source texture graph channels, factors, normal scale, UVs/transforms, shared-image reuse, rendering flags, safe disposal, diagnostics, and runnable TSL exports.",
);
