import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";

const directory = await mkdtemp(path.join(tmpdir(), "glb-viewer-test-"));
const data = Buffer.alloc(68);
[0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1].forEach((value, i) =>
  data.writeFloatLE(value, i * 4),
);
const gltf = {
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: "Test triangle", mesh: 0 }],
  buffers: [{ uri: "mesh.bin", byteLength: data.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 8 },
    { buffer: 0, byteOffset: 44, byteLength: 24 },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 3,
      type: "VEC3",
      min: [0, 0, 0],
      max: [1, 1, 0],
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: 2,
      type: "SCALAR",
      min: [0],
      max: [1],
    },
    { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  materials: [
    {
      pbrMetallicRoughness: { baseColorFactor: [0.5, 0.8, 0.4, 1] },
      doubleSided: true,
    },
  ],
  animations: [
    {
      name: "Lift",
      samplers: [{ input: 1, output: 2 }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
    },
  ],
};
await writeFile(path.join(directory, "mesh.bin"), data);
function pngChunk(type, bytes) {
  const payload = Buffer.concat([Buffer.from(type), bytes]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, payload, checksum]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(1, 0);
ihdr.writeUInt32BE(1, 4);
ihdr[8] = 8;
ihdr[9] = 6;
await writeFile(
  path.join(directory, "pixel.png"),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 255, 255, 255]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]),
);
gltf.images = [{ uri: "pixel.png" }];
gltf.textures = [{ source: 0 }];
gltf.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
await writeFile(path.join(directory, "triangle.gltf"), JSON.stringify(gltf));
const embedded = structuredClone(gltf);
delete embedded.buffers[0].uri;
let json = Buffer.from(JSON.stringify(embedded));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + data.length, 8);
header.writeUInt32LE(json.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(data.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
await writeFile(
  path.join(directory, "triangle.glb"),
  Buffer.concat([header, json, binHeader, data]),
);
await writeFile(path.join(directory, "broken.glb"), "broken");
const missing = structuredClone(gltf);
missing.buffers[0].uri = "missing.bin";
await writeFile(path.join(directory, "missing.gltf"), JSON.stringify(missing));
const missingTexture = structuredClone(gltf);
missingTexture.images[0].uri = "absent.png";
await writeFile(
  path.join(directory, "missing-texture.gltf"),
  JSON.stringify(missingTexture),
);
let app;
try {
  const env = {
    ...process.env,
    GLB_VIEWER_USER_DATA: path.join(directory, "user-data"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: process.env.SMOKE_APP_PATH ? [] : ["."],
    executablePath: process.env.SMOKE_APP_PATH,
    cwd: process.cwd(),
    env,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  await page.screenshot({ path: path.join(tmpdir(), "glb-viewer-smoke.png") });
  await page.locator("#model-draw-calls").filter({ hasText: "1" }).waitFor();
  await page
    .locator("[data-node-id]")
    .filter({ hasText: "Knot sculpture" })
    .click();
  await page
    .locator("#selected-object")
    .filter({ hasText: "Knot sculpture" })
    .waitFor();
  assert.equal(
    await page.locator('[data-node-id][aria-pressed="true"]').count(),
    1,
  );
  await page.screenshot({ path: path.join(tmpdir(), "glb-selection.png") });
  await page.locator("#clear-selection").click();
  assert.equal(
    await page.locator('[data-node-id][aria-pressed="true"]').count(),
    0,
  );
  await page.locator("#wireframe").click();
  await page.locator("#view-mode").filter({ hasText: "Wireframe" }).waitFor();
  await page.locator("#wireframe").click();
  await page.locator("#normal-overlay").selectOption("vertex");
  await page.locator("#normal-length").fill("3");
  await page.locator("#normals-selected").click();
  await page.locator("#bone-overlay").click();
  await page.locator("#overlay-in-front").click();
  await page.screenshot({
    path: path.join(tmpdir(), "glb-normal-overlays.png"),
  });
  await page.locator("#normal-overlay").selectOption("face");
  await page.locator("#normal-overlay").selectOption("off");
  await page.locator("#bone-overlay").click();
  await page.locator("#grid").click();
  await page.locator("#rotate").click();
  await page.locator("#rotate").click();
  await page.locator("#environment").selectOption("direct");
  await page.locator("#environment").selectOption("studio");
  const open = async (name) => {
    const response = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/" + name),
    );
    await app.evaluate(
      ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
      path.join(directory, name),
    );
    await response;
    await page.locator("#loading").waitFor({ state: "hidden" });
  };
  await open("triangle.gltf");
  await page
    .locator("#filename")
    .filter({ hasText: "triangle.gltf" })
    .waitFor();
  assert.equal(await page.locator("#triangles").textContent(), "1");
  assert.equal(await page.locator("#vertices").textContent(), "3");
  assert.equal(await page.locator("#meshes").textContent(), "1");
  assert.equal(await page.locator("#textures").textContent(), "1");
  assert.equal(await page.locator("#animation option").textContent(), "Lift");
  await page.locator("#play").click();
  await page.locator("#scrub [role=slider]").press("Home");
  for (let i = 0; i < 5; i++)
    await page.locator("#scrub [role=slider]").press("Shift+ArrowRight");
  assert.match(await page.locator("#time").textContent(), /0.50 \/ 1.00/);
  await page.locator("#play").click();
  await open("triangle.glb");
  await page.locator("#filename").filter({ hasText: "triangle.glb" }).waitFor();
  assert.equal(await page.locator("#triangles").textContent(), "1");
  await open("broken.glb");
  await page
    .locator("#status")
    .filter({ hasText: "Could not load model" })
    .waitFor();
  assert.equal(await page.locator("#filename").textContent(), "triangle.glb");
  await open("missing.gltf");
  await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Could not load model" })
    .first()
    .waitFor();
  await open("missing-texture.gltf");
  await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Missing or unreadable resource" })
    .first()
    .waitFor();
  assert.equal(await page.locator("#filename").textContent(), "triangle.glb");
  assert.deepEqual(errors, [], "No uncaught renderer errors");
  console.log(
    "PASS: demo rendering, display controls, local glTF buffers/textures, GLB, animation playback/scrubbing, malformed file and missing-resource recovery.",
  );
  console.log("Visual check: " + path.join(tmpdir(), "glb-viewer-smoke.png"));
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
